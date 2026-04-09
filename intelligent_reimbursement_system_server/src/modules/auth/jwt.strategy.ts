import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

const fromCookie = (req: { headers?: { cookie?: string } }) => {
  const rawCookie = req?.headers?.cookie;
  if (!rawCookie) return null;
  const tokenPair = rawCookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('access_token='));
  if (!tokenPair) return null;
  return decodeURIComponent(tokenPair.substring('access_token='.length));
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromCookie,
      ]),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: { id: string; username: string }) {
    return { id: payload.id, username: payload.username };
  }
}
