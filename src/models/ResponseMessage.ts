export class ResponseMessage<T> {
  topic: string = "";
  response: T | null = null;
}
