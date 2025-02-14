import { struct } from "superstruct";


export const createPost = struct({
  clientId: "string",       // 사용자 ID (문자열)
  title: "string",          // 제목 (문자열)
  content: "string",        // 내용 (문자열)
  imageUrl: "string?",      // 이미지 URL (선택 사항)
  location: "string?",      // 위치 (선택 사항)
  moment: "string",         // 작성 시간 (문자열, "YYYY-MM-DD" 형식)
  isPublic: "boolean",      // 공개 여부 (true / false)
  tag: "string?",           // 태그 (선택 사항)
});
