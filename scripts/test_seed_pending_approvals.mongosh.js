/**
 * 集成验证待审批测试数据脚本（仅允许测试库执行）
 * 用法:
 * mongosh "mongodb://localhost:27017/_seed_pending_approvals_test" \
 *   scripts/test_seed_pending_approvals.mongosh.js
 */
const TEST_DB_PREFIX = '_seed_pending_approvals_test';
const SEED_KEY = 'seed_pending_approvals_v1';

if (!db.getName().startsWith(TEST_DB_PREFIX)) {
  throw new Error(`安全检查失败：仅允许在 ${TEST_DB_PREFIX}* 数据库执行`);
}

db.dropDatabase();

const now = new Date();
const applicantId = new ObjectId();
const approverUserIds = [new ObjectId(), new ObjectId()];
const departmentId = new ObjectId();
const employeeIds = [new ObjectId(), new ObjectId()];
const companyId = new ObjectId();
const typeIds = [new ObjectId(), new ObjectId()];

db.users.insertMany([
  {
    _id: applicantId,
    username: 'seed-applicant',
    password: 'not-used-in-test',
    email: 'seed-applicant@example.test',
    real_name: '测试申请人',
    status: 1,
    createdAt: now,
    updatedAt: now,
  },
  ...approverUserIds.map((userId, index) => ({
    _id: userId,
    username: `seed-approver-${index + 1}`,
    password: 'not-used-in-test',
    email: `seed-approver-${index + 1}@example.test`,
    real_name: `测试审批人${index + 1}`,
    status: 1,
    createdAt: now,
    updatedAt: now,
  })),
]);

db.department.insertOne({
  _id: departmentId,
  name: '测试部门',
  code: 'seed-test-department',
  status: 1,
  createdAt: now,
  updatedAt: now,
});

db.employee.insertMany(
  employeeIds.map((employeeId, index) => ({
    _id: employeeId,
    employee_no: `SEED-APPROVER-${index + 1}`,
    name: `测试审批人${index + 1}`,
    gender: 0,
    dept_id: String(departmentId),
    position: '测试审批员',
    status: 1,
    uid: String(approverUserIds[index]),
    createdAt: now,
    updatedAt: now,
  })),
);

db.companies.insertOne({
  _id: companyId,
  name: '测试公司',
  createdAt: now,
  updatedAt: now,
});

db.reimbursement_types.insertMany([
  {
    _id: typeIds[0],
    code: 'seed-office',
    name: '测试办公费',
    label: '测试办公费',
    fields: [],
    status: 1,
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: typeIds[1],
    code: 'seed-travel',
    name: '测试差旅费',
    label: '测试差旅费',
    fields: [],
    status: 1,
    createdAt: now,
    updatedAt: now,
  },
]);

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
}

function verifySeededData() {
  const reimbursements = db.reimbursements_records
    .find({ _seed_key: SEED_KEY })
    .toArray();
  const reimbursementIds = reimbursements.map((item) => String(item._id));
  const approvalRecords = db.approval_records
    .find({ _seed_key: SEED_KEY })
    .toArray();
  const approvalFlows = db.approval_flow.find({ _seed_key: SEED_KEY }).toArray();

  assert(reimbursements.length === 5, '应创建 5 条报销记录');
  assert(approvalRecords.length === 5, '应创建 5 条审批记录');
  assert(approvalFlows.length === 2, '应创建 2 条审批流');
  assert(
    reimbursements.every(
      (item) => item.status === 'pending' && item.has_approval_flow === true,
    ),
    '所有报销记录都应处于待审批状态并绑定审批流',
  );
  assert(
    approvalRecords.every(
      (item) =>
        item.status === 'pending' &&
        item.cur_node_idx === 0 &&
        item.actions.length === 0 &&
        reimbursementIds.includes(item.record_id),
    ),
    '审批记录应为首节点待审批且正确关联报销记录',
  );
  assert(
    approvalRecords.every((item) =>
      item.flow_snapshot.nodes[0].approvers.every(
        (approver) => approver.participation === 'pending',
      ),
    ),
    '审批快照中的审批人都应处于待审批状态',
  );
}

load('scripts/seed_pending_approvals.mongosh.js');
verifySeededData();

load('scripts/seed_pending_approvals.mongosh.js');
verifySeededData();

print('PASS：待审批测试数据脚本首次执行及重复执行验证通过');
db.dropDatabase();
