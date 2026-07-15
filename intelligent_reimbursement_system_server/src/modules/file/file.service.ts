import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as qiniu from 'qiniu';
import * as path from 'path';
import { File } from '../../schemas/file.schema';
import { decodeUploadedFilename } from '../../common/filename.util';

@Injectable()
export class FileService {
  constructor(
    @InjectModel(File.name) private fileModel: Model<File>,
    private config: ConfigService,
  ) {}

  private getUploadToken(): string {
    const mac = new qiniu.auth.digest.Mac(
      this.config.get('QINIU_ACCESS_KEY'),
      this.config.get('QINIU_SECRET_KEY'),
    );
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: this.config.get('QINIU_BUCKET'),
    });
    return putPolicy.uploadToken(mac);
  }

  private generateRandomString(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 11; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
    type: string = 'attachment',
  ) {
    if (!['avatar', 'attachment'].includes(type)) {
      throw new BadRequestException('文件类型参数无效');
    }

    return this.uploadBuffer({
      buffer: file.buffer,
      originalname: decodeUploadedFilename(file.originalname),
      mimetype: file.mimetype,
      userId,
      type,
    });
  }

  async uploadBuffer(params: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    userId: string;
    type?: string;
  }) {
    const type = params.type ?? 'attachment';
    if (!['avatar', 'attachment'].includes(type)) {
      throw new BadRequestException('文件类型参数无效');
    }

    const token = this.getUploadToken();
    const qiniuConfig = new qiniu.conf.Config();
    const zone = (qiniu as unknown as Record<string, Record<string, unknown>>)
      .zone;
    (qiniuConfig as unknown as Record<string, unknown>).zone = zone['Zone_z1'];
    const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
    const putExtra = new qiniu.form_up.PutExtra();

    const ext = path.extname(params.originalname);
    const dir = params.mimetype === 'application/pdf' ? 'pdf' : 'image';
    const key = `${dir}/${Date.now()}_${this.generateRandomString()}${ext}`;

    const result = await new Promise<{ key: string }>((resolve, reject) => {
      void formUploader.put(
        token,
        key,
        params.buffer,
        putExtra,
        (
          err: Error | undefined,
          body: { key: string; error?: string },
          info: { statusCode: number },
        ) => {
          if (err) return reject(err);
          if (info.statusCode !== 200)
            return reject(new Error(body?.error || '上传失败'));
          resolve(body);
        },
      );
    });

    const url = `${this.config.get('QINIU_DOMAIN')}/${result.key}`;

    const record = await this.fileModel.create({
      type,
      url,
      original_name: params.originalname,
      size: params.buffer.length,
      mime_type: params.mimetype,
      uploader: params.userId,
      uid: params.userId,
    });

    return { id: record._id, url };
  }
}
