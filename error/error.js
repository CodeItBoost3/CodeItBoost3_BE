export class CustomError extends Error {
  constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      Object.setPrototypeOf(this, CustomError.prototype);
  }
}

export function errorHandler(handler){
  return async (req, res) => {
    try{
      await handler(req, res);
    }
    catch(e){
      console.log("Error type:", e.constructor.name);
  
      if(e.statusCode < 500){
        res.status(e.statusCode).send({
          status: 'fail',
          message: e.message
        });
      }
      else{
        res.status(500).send({
          status: 'error',
          message: '서버 에러입니다. 서버 관리자에게 문의해주세요',
        });
      }
    }
  }
}