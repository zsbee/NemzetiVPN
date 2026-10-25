import http from 'http';

// Node 8's writeHead does not return the response for chaining.
export default {
  createServer(listener: (request: http.IncomingMessage, response: http.ServerResponse) => void) {
    return http.createServer((request, response) => {
      const writeHead = response.writeHead;
      response.writeHead = function (status: number, messageOrHeaders?: string | http.OutgoingHttpHeaders | http.OutgoingHttpHeader[], headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]) {
        Reflect.apply(writeHead, this, [status, messageOrHeaders, headers]);
        return this;
      };
      listener(request, response);
    });
  },
};
