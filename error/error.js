
export class CustomError extends Error {
  constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      Object.setPrototypeOf(this, CustomError.prototype);
  }
}

export function errorHandler(){
  return function(err, req, res, next){
    console.error("🔴 Error caught in errorHandler:", err.message);
    if(err instanceof CustomError){
      res.status(err.statusCode).send({
        status: 'fail',
        message: err.message
      });
    }
    else{
      res.status(500).send({
        status: 'error',
        message: '처리되지 않은 에러입니다. 서버에 문의해주세요.\n' + err.message,
      });    
    }
  }
}