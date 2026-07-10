import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TenantTokenResponse = {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

@Injectable()
export class FeishuApiClient {
  private readonly logger = new Logger(FeishuApiClient.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('FEISHU_BOT_ENABLED') === 'true';
  }

  async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.value;
    }

    const appId = this.config.get<string>('FEISHU_APP_ID');
    const appSecret = this.config.get<string>('FEISHU_APP_SECRET');
    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID 或 FEISHU_APP_SECRET 未配置');
    }

    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      },
    );
    const data = (await res.json()) as TenantTokenResponse;
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(data.msg ?? '获取 tenant_access_token 失败');
    }

    this.cachedToken = {
      value: data.tenant_access_token,
      expiresAt: now + (data.expire ?? 7200) * 1000,
    };
    return data.tenant_access_token;
  }

  async downloadMessageResource(
    messageId: string,
    fileKey: string,
    type: 'file' | 'image',
  ): Promise<Buffer> {
    const token = await this.getTenantAccessToken();
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${type}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`下载飞书文件失败: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async sendInteractiveCard(chatId: string, card: unknown): Promise<string> {
    const token = await this.getTenantAccessToken();
    const res = await fetch(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify((card as { card?: unknown }).card ?? card),
        }),
      },
    );
    const data = (await res.json()) as {
      code: number;
      msg?: string;
      data?: { message_id?: string };
    };
    if (data.code !== 0 || !data.data?.message_id) {
      this.logger.error(`发送卡片失败: ${JSON.stringify(data)}`);
      throw new Error(data.msg ?? '发送飞书卡片失败');
    }
    return data.data.message_id;
  }

  async getUserByOpenId(openId: string): Promise<{
    open_id: string;
    name?: string;
    email?: string;
    mobile?: string;
    avatar_url?: string;
  }> {
    const token = await this.getTenantAccessToken();
    const res = await fetch(
      `https://open.feishu.cn/open-apis/contact/v3/users/${openId}?user_id_type=open_id`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json()) as {
      code: number;
      msg?: string;
      data?: { user?: Record<string, string> };
    };
    if (data.code !== 0 || !data.data?.user) {
      throw new Error(data.msg ?? '获取飞书用户信息失败');
    }
    const user = data.data.user;
    return {
      open_id: openId,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      avatar_url: user.avatar_url,
    };
  }
}
