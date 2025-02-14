import { object, string, size, min } from 'superstruct';

export const createUser = object({
  clientId: size(string(), 6, 15), // 6~15자 문자열
  password: size(string(), 8, 16), // 8~16자 문자열
  nickname: size(string(), 1, 30) // 1~30자 문자열
});
