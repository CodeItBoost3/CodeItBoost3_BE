import { struct } from "superstruct";


export const createPost = struct({
  clientId: "string",       // 사용자 ID (문자열)
  title: "string",          // 제목 (문자열)
  content: "string",        // 내용 (문자열)
  location: "string?",      // 위치 (선택 사항)
  moment: "date",         // 작성 시간 (날짜 타입)
  isPublic: "boolean",      // 공개 여부 (true / false)
  tag: "string?",           // 태그 (선택 사항)
});
