/**
 * 创建可重复清理的待审批测试数据（mongosh 执行）
 * 用法:
 * mongosh "mongodb://localhost:27017/Reimbursement" \
 *   scripts/seed_pending_approvals.mongosh.js
 */
(function seedPendingApprovals() {
  const SEED_KEY = 'seed_pending_approvals_v1';
  const REIMBURSEMENT_COUNT = 5;
  const FLOW_COUNT = 2;
  const TEST_FLOW_AMOUNT_MIN = 900000000;
  const TEST_FLOW_PRIORITY = 9999;

  function requireData(value, message) {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      throw new Error(message);
    }
    return value;
  }

  function idCandidates(value) {
    const candidates = [value];
    try {
      const objectId = new ObjectId(String(value));
      if (String(objectId) !== String(value)) return candidates;
      candidates.push(objectId);
    } catch {
      // 历史数据可能使用非 ObjectId 字符串主键。
    }
    return candidates;
  }

  function findActiveUserById(value) {
    return db.users.findOne({
      _id: { $in: idCandidates(value) },
      status: 1,
    });
  }

  function resolveApproverCandidates() {
    return db.employee
      .find({ status: 1 })
      .toArray()
      .map((employee) => {
        const user = employee.uid
          ? findActiveUserById(employee.uid)
          : db.users.findOne({ real_name: employee.name, status: 1 });
        return user ? { employee, user } : null;
      })
      .filter(Boolean)
      .slice(0, 2);
  }

  function resolveDepartmentName(employee, applicant) {
    if (employee.dept_id) {
      const department = db.department.findOne({
        _id: { $in: idCandidates(employee.dept_id) },
      });
      if (department?.name) return department.name;
    }
    return applicant.department || '测试部门';
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const applicant = requireData(
    db.users.findOne({ status: 1 }),
    '缺少启用中的用户，请先创建用户',
  );
  const company = requireData(
    db.companies.findOne({}),
    '缺少公司，请先执行 scripts/seed_companies.mongosh.js',
  );
  const reimbursementTypes = requireData(
    db.reimbursement_types
      .find({ status: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .limit(FLOW_COUNT)
      .toArray(),
    '缺少启用中的报销类型，请先执行 scripts/seed_reimbursement_types.mongosh.js',
  );
  if (reimbursementTypes.length < FLOW_COUNT) {
    throw new Error(`至少需要 ${FLOW_COUNT} 个启用中的报销类型`);
  }

  const approverCandidates = requireData(
    resolveApproverCandidates(),
    '缺少可登录的启用员工：员工需通过 uid 或姓名关联启用用户',
  );
  const now = new Date();
  const approvers = approverCandidates.map(({ employee, user }) => ({
    employee_id: String(employee._id),
    user_id: String(user._id),
    username: user.username,
    name: employee.name,
    avatar: employee.avatar || '',
    dept_name: resolveDepartmentName(employee, applicant),
    position: employee.position || '',
  }));

  const oldReimbursements = db.reimbursements_records
    .find({ _seed_key: SEED_KEY }, { _id: 1 })
    .toArray();
  const oldReimbursementIds = oldReimbursements.map((item) => String(item._id));

  db.approval_records.deleteMany({
    $or: [
      { _seed_key: SEED_KEY },
      { record_id: { $in: oldReimbursementIds } },
    ],
  });
  db.reimbursements_records.deleteMany({ _seed_key: SEED_KEY });
  db.approval_flow.deleteMany({ _seed_key: SEED_KEY });

  const flowDocuments = reimbursementTypes.map((type, index) => ({
    _seed_key: SEED_KEY,
    type_code: type.code,
    enabled: true,
    nodes: [
      {
        node_id: `${SEED_KEY}_node_${index + 1}`,
        approver_ids: approvers.map((approver) => approver.employee_id),
        notify_flags: approvers.map(() => false),
        sign_type: index % 2 === 0 ? 'countersign' : 'orsign',
        sort: 0,
      },
    ],
    created_by: String(applicant._id),
    amount_min: TEST_FLOW_AMOUNT_MIN + index * 10,
    amount_max: TEST_FLOW_AMOUNT_MIN + index * 10 + 1,
    priority: TEST_FLOW_PRIORITY,
    createdAt: now,
    updatedAt: now,
  }));
  db.approval_flow.insertMany(flowDocuments);

  const amounts = [128.5, 356, 880, 1250.8, 2688];
  const reimbursementDocuments = [];
  const approvalRecordDocuments = [];

  for (let index = 0; index < REIMBURSEMENT_COUNT; index += 1) {
    const reimbursementId = new ObjectId();
    const type = reimbursementTypes[index % reimbursementTypes.length];
    const createdAt = new Date(now.getTime() - index * 60 * 60 * 1000);
    const applyDate = new Date(now);
    applyDate.setDate(applyDate.getDate() - index);

    reimbursementDocuments.push({
      _id: reimbursementId,
      _seed_key: SEED_KEY,
      submission_batch_id: `${SEED_KEY}_batch_${index + 1}`,
      applicant: String(applicant._id),
      category: String(type._id),
      category_name: type.label || type.name,
      department_name: applicant.department || approvers[0].dept_name,
      payment_account: applicant.payment_account || '测试收款账户',
      company_id: String(company._id),
      company_name: company.name,
      amount: amounts[index],
      detail: {
        purpose: `待审批测试报销 ${index + 1}`,
        amount: amounts[index],
      },
      attachments: [],
      status: 'pending',
      apply_date: formatDate(applyDate),
      is_over_limit: false,
      has_approval_flow: true,
      invoice_number: '',
      createdAt,
      updatedAt: createdAt,
    });

    approvalRecordDocuments.push({
      _seed_key: SEED_KEY,
      record_id: String(reimbursementId),
      flow_snapshot: {
        nodes: [
          {
            node_id: `${SEED_KEY}_snapshot_${index + 1}`,
            sign_type: index % 2 === 0 ? 'countersign' : 'orsign',
            approvers: approvers.map((approver) => ({
              approver_id: approver.employee_id,
              name: approver.name,
              avatar: approver.avatar,
              dept_name: approver.dept_name,
              position: approver.position,
              notify: false,
              participation: 'pending',
            })),
            approved_by: [],
            transfers: {},
          },
        ],
      },
      cur_node_idx: 0,
      status: 'pending',
      actions: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  db.reimbursements_records.insertMany(reimbursementDocuments);
  db.approval_records.insertMany(approvalRecordDocuments);

  print(`已创建 ${flowDocuments.length} 条测试审批流`);
  print(`已创建 ${reimbursementDocuments.length} 条待审批报销记录`);
  print(`已创建 ${approvalRecordDocuments.length} 条待审批审批记录`);
  print('可查看待审批数据的现有账号：');
  approvers.forEach((approver) => {
    print(`- ${approver.username}（员工：${approver.name}）`);
  });
  print(`重复执行会先清理标记为 ${SEED_KEY} 的旧测试数据`);
})();
