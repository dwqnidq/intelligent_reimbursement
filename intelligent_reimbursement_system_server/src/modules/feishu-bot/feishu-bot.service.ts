import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class FeishuBotService {
  handleEventHttp(req: Request, res: Response): void {
    const body = req.body as { challenge?: string };
    if (body?.challenge) {
      res.json({ challenge: body.challenge });
      return;
    }
    res.status(200).send();
  }

  handleCardHttp(_req: Request, res: Response): void {
    res.status(200).send();
  }
}
