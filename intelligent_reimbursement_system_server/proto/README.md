# Proto 文件目录

请将你的 `.proto` 文件放在此目录下。

## 使用示例

假设你有一个 `example.proto` 文件：

```protobuf
syntax = "proto3";

package example;

service ExampleService {
  rpc SayHello (HelloRequest) returns (HelloResponse) {}
}

message HelloRequest {
  string name = 1;
}

message HelloResponse {
  string message = 1;
}
```

在代码中使用：

```javascript
const grpcClient = require('./src/grpc/client');

// 加载 proto 文件并创建客户端
grpcClient.loadProto('example.proto', 'ExampleService', 'localhost:50051');

// 获取客户端并调用方法
const client = grpcClient.getClient('ExampleService');
client.SayHello({ name: 'World' }, (error, response) => {
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Response:', response.message);
  }
});
```
