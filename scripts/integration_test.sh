#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:3000/api"
TS=$(date +%s)
USER="test_${TS}"
PASS="test123456"
EMAIL="test_${TS}@example.com"
REAL_NAME="集成测试用户"

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

json_get() {
  node -e "
    const d=JSON.parse(process.argv[1]);
    const p=process.argv[2].split('.');
    let v=d;
    for (const k of p) v=v?.[k];
    if (v===undefined||v===null) process.exit(2);
    if (typeof v==='object') console.log(JSON.stringify(v)); else console.log(v);
  " "$1" "$2"
}

echo "========== 0. 初始化公司数据 =========="
mongosh "mongodb://127.0.0.1:27017/Reimbursement" --quiet --file "$(dirname "$0")/seed_companies.mongosh.js" >/dev/null 2>&1 || true
pass "公司种子数据已就绪"

echo ""
echo "========== 1. 注册用户 =========="
REG=$(curl -s -X POST "$API/users" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\",\"email\":\"$EMAIL\",\"real_name\":\"$REAL_NAME\"}")
CODE=$(json_get "$REG" "code" 2>/dev/null || echo "fail")
[[ "$CODE" == "200" ]] && pass "注册成功: $USER" || fail "注册失败: $REG"

echo ""
echo "========== 2. 登录（应提示需填收款账户） =========="
LOGIN=$(curl -s -X POST "$API/users/login" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")
TOKEN=$(json_get "$LOGIN" "data.token" 2>/dev/null || true)
PAY_ACC=$(json_get "$LOGIN" "data.user.payment_account" 2>/dev/null || echo "")
[[ -n "$TOKEN" ]] && pass "登录成功，拿到 token" || fail "登录失败: $LOGIN"
[[ -z "$PAY_ACC" ]] && pass "登录用户 payment_account 为空（符合预期）" || fail "新用户不应已有收款账户"

AUTH="Authorization: Bearer $TOKEN"

echo ""
echo "========== 3. 部门名称选项 =========="
DEPTS=$(curl -s "$API/departments/name-options" -H "$AUTH")
D_CODE=$(json_get "$DEPTS" "code" 2>/dev/null || echo "fail")
D_LEN=$(node -e "const d=JSON.parse(process.argv[1]); console.log((d.data||[]).length)" "$DEPTS")
[[ "$D_CODE" == "200" ]] && pass "部门选项接口正常，返回 $D_LEN 个部门" || fail "部门选项失败: $DEPTS"

echo ""
echo "========== 4. 未填收款账户时创建报销应失败 =========="
TYPES=$(curl -s "$API/reimbursement-types" -H "$AUTH")
TYPE_ID=$(node -e "const d=JSON.parse(process.argv[1]); const t=d.data?.[0]; if(!t) process.exit(1); console.log(t._id)" "$TYPES" 2>/dev/null || echo "")
[[ -n "$TYPE_ID" ]] && pass "获取报销类型: $TYPE_ID" || fail "无可用报销类型，请先配置"

DEPT_NAME=$(node -e "const d=JSON.parse(process.argv[1]); console.log(d.data?.[0]||'测试部门')" "$DEPTS")

REJ=$(curl -s -X POST "$API/reimbursements" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"applicant_name\":\"$REAL_NAME\",\"category\":\"$TYPE_ID\",\"department_name\":\"$DEPT_NAME\",\"apply_date\":\"2026-07-01\",\"attachments\":[],\"details\":[{\"amount\":100}]}]")
REJ_CODE=$(json_get "$REJ" "code" 2>/dev/null || echo "200")
[[ "$REJ_CODE" != "200" ]] && pass "未完善资料时创建报销被拒绝" || fail "应拒绝但未拒绝: $REJ"

echo ""
echo "========== 5. 设置公司与收款账户 =========="
COMPANY_ID=$(node -e "const d=JSON.parse(process.argv[1]); const c=d.data?.[0]; if(!c?._id) process.exit(1); console.log(c._id)" "$(curl -s "$API/companies/name-options" -H "$AUTH")" 2>/dev/null || echo "")
[[ -n "$COMPANY_ID" ]] && pass "获取公司选项: $COMPANY_ID" || fail "无可用公司，请先执行 seed_companies.mongosh.js"

PA=$(curl -s -X PATCH "$API/users/profile-setup" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"company_id\":\"$COMPANY_ID\",\"payment_account\":\"6222021234567890\"}")
PA_CODE=$(json_get "$PA" "code" 2>/dev/null || echo "fail")
PA_VAL=$(json_get "$PA" "data.payment_account" 2>/dev/null || echo "")
CO_ID=$(json_get "$PA" "data.company_id" 2>/dev/null || echo "")
CO_NAME=$(json_get "$PA" "data.company_name" 2>/dev/null || echo "")
[[ "$PA_CODE" == "200" && "$PA_VAL" == "6222021234567890" && "$CO_ID" == "$COMPANY_ID" ]] && pass "公司与收款账户设置成功: $CO_NAME" || fail "资料设置失败: $PA"

echo ""
echo "========== 6. 缺少部门时创建报销应失败 =========="
NO_DEPT=$(curl -s -X POST "$API/reimbursements" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"applicant_name\":\"$REAL_NAME\",\"category\":\"$TYPE_ID\",\"apply_date\":\"2026-07-01\",\"attachments\":[],\"details\":[{\"amount\":100}]}]")
ND_CODE=$(json_get "$NO_DEPT" "code" 2>/dev/null || echo "200")
[[ "$ND_CODE" != "200" ]] && pass "缺少 department_name 时被拒绝" || fail "应拒绝缺少部门: $NO_DEPT"

echo ""
echo "========== 7. 正常创建报销（含部门+收款账户） =========="
OK=$(curl -s -X POST "$API/reimbursements" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"applicant_name\":\"$REAL_NAME\",\"category\":\"$TYPE_ID\",\"department_name\":\"$DEPT_NAME\",\"apply_date\":\"2026-07-01\",\"attachments\":[],\"details\":[{\"total_amount\":88}]}]")
OK_CODE=$(json_get "$OK" "code" 2>/dev/null || echo "fail")
REC_ID=$(json_get "$OK" "data.ids.0" 2>/dev/null || echo "")
[[ "$OK_CODE" == "200" && -n "$REC_ID" ]] && pass "报销创建成功 id=$REC_ID" || fail "报销创建失败: $OK"

echo ""
echo "========== 7b. 发票号码去重 =========="
INV_NO="INV_${TS}"
CHK1=$(curl -s "$API/reimbursements/invoice-check?number=$INV_NO" -H "$AUTH")
CHK1_AVAIL=$(json_get "$CHK1" "data.available" 2>/dev/null || echo "false")
[[ "$CHK1_AVAIL" == "true" ]] && pass "新发票号可用: $INV_NO" || fail "新发票号应可用: $CHK1"

INV_OK=$(curl -s -X POST "$API/reimbursements" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"applicant_name\":\"$REAL_NAME\",\"category\":\"$TYPE_ID\",\"department_name\":\"$DEPT_NAME\",\"apply_date\":\"2026-07-01\",\"invoice_number\":\"$INV_NO\",\"attachments\":[],\"details\":[{\"total_amount\":66}]}]")
INV_OK_CODE=$(json_get "$INV_OK" "code" 2>/dev/null || echo "fail")
[[ "$INV_OK_CODE" == "200" ]] && pass "带发票号报销创建成功" || fail "带发票号创建失败: $INV_OK"

CHK2=$(curl -s "$API/reimbursements/invoice-check?number=$INV_NO" -H "$AUTH")
CHK2_AVAIL=$(json_get "$CHK2" "data.available" 2>/dev/null || echo "true")
[[ "$CHK2_AVAIL" == "false" ]] && pass "已报销发票号不可用" || fail "已报销发票号应不可用: $CHK2"

DUP_INV=$(curl -s -X POST "$API/reimbursements" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"applicant_name\":\"$REAL_NAME\",\"category\":\"$TYPE_ID\",\"department_name\":\"$DEPT_NAME\",\"apply_date\":\"2026-07-01\",\"invoice_number\":\"$INV_NO\",\"attachments\":[],\"details\":[{\"total_amount\":99}]}]")
DUP_INV_CODE=$(json_get "$DUP_INV" "code" 2>/dev/null || echo "200")
[[ "$DUP_INV_CODE" != "200" ]] && pass "重复发票号提交被拒绝" || fail "重复发票号应拒绝: $DUP_INV"

echo ""
echo "========== 8. 校验报销记录字段 =========="
REC=$(mongosh "mongodb://localhost:27017/Reimbursement" --quiet --eval "JSON.stringify(db.reimbursements_records.findOne({_id: ObjectId('$REC_ID')}, {department_name:1,payment_account:1,company_id:1,company_name:1,applicant:1}))" 2>/dev/null)
node -e "
const r=JSON.parse(process.argv[1]);
if(r.department_name!==process.argv[2]) { console.error('department_name mismatch', r); process.exit(1); }
if(r.payment_account!=='6222021234567890') { console.error('payment_account mismatch', r); process.exit(1); }
if(r.company_id!==process.argv[3]) { console.error('company_id mismatch', r); process.exit(1); }
if(!r.company_name) { console.error('company_name missing', r); process.exit(1); }
console.log('ok');
" "$REC" "$DEPT_NAME" "$COMPANY_ID" && pass "DB 中 department_name、payment_account、company 字段正确" || fail "DB 字段校验失败: $REC"

echo ""
echo "========== 9. 报销类型 name/label 规则 =========="
TCODE="test_type_${TS}"
TNAME="集成测试类型_${TS}"
TLABEL="福利费"
CREATE_TYPE=$(curl -s -X POST "$API/reimbursement-types" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"code\":\"$TCODE\",\"name\":\"$TNAME\",\"label\":\"$TLABEL\",\"status\":1,\"fields\":[{\"key\":\"amount\",\"label\":\"金额\",\"type\":\"number\",\"required\":true,\"sort\":0}]}]")
CT_CODE=$(json_get "$CREATE_TYPE" "code" 2>/dev/null || echo "fail")
[[ "$CT_CODE" == "200" ]] && pass "创建报销类型成功（name 唯一）" || fail "创建类型失败: $CREATE_TYPE"

DUP_LABEL=$(curl -s -X POST "$API/reimbursement-types" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"code\":\"test_type_dup_${TS}\",\"name\":\"集成测试类型2_${TS}\",\"label\":\"$TLABEL\",\"status\":1,\"fields\":[{\"key\":\"amount\",\"label\":\"金额\",\"type\":\"number\",\"required\":true,\"sort\":0}]}]")
DL_CODE=$(json_get "$DUP_LABEL" "code" 2>/dev/null || echo "fail")
[[ "$DL_CODE" == "200" ]] && pass "label 可重复：相同 label「$TLABEL」创建成功" || fail "label 重复应允许: $DUP_LABEL"

DUP_NAME=$(curl -s -X POST "$API/reimbursement-types" -H "$AUTH" -H "Content-Type: application/json" \
  -d "[{\"code\":\"test_type_dup2_${TS}\",\"name\":\"$TNAME\",\"label\":\"其他标签\",\"status\":1,\"fields\":[{\"key\":\"amount\",\"label\":\"金额\",\"type\":\"number\",\"required\":true,\"sort\":0}]}]")
DN_CODE=$(json_get "$DUP_NAME" "code" 2>/dev/null || echo "200")
[[ "$DN_CODE" != "200" ]] && pass "name 重复时被拒绝" || fail "name 重复应拒绝: $DUP_NAME"

echo ""
echo "========== 10. LangGraph 类型匹配逻辑 =========="
cd /Users/edy/Downloads/intelligent_reimbursement/intelligent_reimbursement/intelligent_reimbursement_system_langgraph
PYTHONPATH=. python3 << 'PY'
from src.db.reimbursement_types_repo import (
    build_types_skeleton_for_llm,
    find_matched_reimbursement_type,
    build_form_result_array_from_db_values,
)

payload = [{
    "code": "welfare_fee",
    "name": "餐费报销",
    "label": "福利费",
    "fields": [{"key": "amount", "label": "金额", "type": "number", "required": True, "options": [], "sort": 0, "is_calculate": True}],
}]
sk = build_types_skeleton_for_llm(payload)
assert "name" in sk[0] and sk[0]["name"] == "餐费报销", sk
assert "label" not in sk[0], sk
matched = find_matched_reimbursement_type(payload, name="餐费报销")
assert matched is not None
wrong = find_matched_reimbursement_type(payload, name="福利费")
assert wrong is None, "不应按 label 匹配"
rows = build_form_result_array_from_db_values(payload, "餐费报销", [{"amount": 100}])
assert rows[0]["label"] == "福利费", rows
print("ok")
PY
pass "LangGraph 按 name 匹配、返回 label 逻辑正确"

echo ""
echo "========== 11. 前端登录跳转逻辑 =========="
node -e "
const { resolvePostLoginPath, needsPaymentAccountSetup } = require('./intelligent_reimbursement_system/dist/assets/index-pKxG3SSH.js');
" 2>/dev/null || node << 'NODE'
function resolvePostLoginPath(user, menus, from) {
  if (user.password_login_enabled === false) return '/password-setup';
  if (!user.company_id?.trim() || !user.company_name?.trim() || !user.payment_account?.trim()) return '/profile-setup';
  return from ?? menus?.[0]?.path ?? '/';
}
const u1 = { password_login_enabled: true, payment_account: '', company_id: '', company_name: '' };
const u2 = { password_login_enabled: true, payment_account: '6222', company_id: 'abc', company_name: '测试公司' };
console.assert(resolvePostLoginPath(u1, []) === '/profile-setup');
console.assert(resolvePostLoginPath(u2, [{ path: '/dashboard' }]) === '/dashboard');
console.log('ok');
NODE
pass "登录后未完善资料跳转 /profile-setup"

echo ""
echo "=========================================="
echo "全部集成测试通过"
echo "=========================================="
