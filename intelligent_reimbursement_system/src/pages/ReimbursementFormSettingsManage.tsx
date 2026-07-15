import { useEffect, useState } from "react";
import { Card, Switch, Button, message, Alert, Spin } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import {
  getReimbursementFormSettings,
  updateReimbursementFormSettings,
} from "../api/reimbursementFormSettings";

export default function ReimbursementFormSettingsManage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [smartEnabled, setSmartEnabled] = useState(true);
  const [manualEnabled, setManualEnabled] = useState(true);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await getReimbursementFormSettings();
      setSmartEnabled(Boolean(res.smart_fill_enabled));
      setManualEnabled(Boolean(res.manual_fill_enabled));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!smartEnabled && !manualEnabled) {
      message.warning("至少需启用一种填写方式");
      return;
    }
    setSaving(true);
    try {
      await updateReimbursementFormSettings({
        smart_fill_enabled: smartEnabled,
        manual_fill_enabled: manualEnabled,
      });
      message.success("配置已保存");
    } catch {
      // 拦截器统一提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--color-primary-bg)]">
          <SettingOutlined className="text-[var(--color-primary)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] m-0">
            报销单填写方式
          </h2>
          <p className="text-sm text-[var(--text-secondary)] m-0 mt-0.5">
            控制「填写报销单」页中智能识别与手动填写两个入口是否对用户展示
          </p>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-5"
        message="至少保留一种填写方式；仅启用一种时，用户进入填写页将直接进入该模式，不再显示切换条。"
      />

      {loading ? (
        <div className="py-10 flex justify-center">
          <Spin />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-color)] px-4 py-3 bg-[var(--bg-page)]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">
                智能识别填写
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                上传发票图片/PDF，由 AI 识别并自动填单
              </div>
            </div>
            <Switch checked={smartEnabled} onChange={setSmartEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--border-color)] px-4 py-3 bg-[var(--bg-page)]">
            <div>
              <div className="font-medium text-[var(--text-primary)]">
                手动填写
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                用户自行选择报销类型并填写字段
              </div>
            </div>
            <Switch checked={manualEnabled} onChange={setManualEnabled} />
          </div>

          <Button
            type="primary"
            loading={saving}
            onClick={() => void handleSave()}
            className="self-start mt-2"
          >
            保存配置
          </Button>
        </div>
      )}
    </Card>
  );
}
