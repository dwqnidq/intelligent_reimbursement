FROM python:3.11-slim

WORKDIR /app

# 使用阿里云 apt 镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

# 安装系统依赖
# libc6-dev：提供 stdint.h 等 C 标准头文件，供 stringzilla 等原生扩展编译
# （slim 镜像默认只有 gcc、无 libc 开发头文件）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存
COPY requirements.txt pyproject.toml .

# 使用阿里云 pip 镜像源。
# paddleocr 会依赖完整版 opencv-python / opencv-contrib-python（各约数十 MB～上百 MB），
# 在弱网部署下极易拖垮构建；改为单一 headless 变体（contrib 已含主模块），并对 paddleocr 使用 --no-deps。
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
      opencv-contrib-python-headless \
    && grep -vE '^(paddleocr|paddlepaddle|opencv-)' requirements.txt > /tmp/requirements.base.txt \
    && pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
      -r /tmp/requirements.base.txt \
    && pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
      'paddlepaddle>=2.6.0,<3.0.0' \
    && pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
      'paddleocr>=2.9.0,<3.0.0' --no-deps \
    && pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
      shapely scikit-image imgaug pyclipper lmdb rapidfuzz cython \
      pyyaml python-docx beautifulsoup4 'fonttools>=4.24.0' 'fire>=0.3.0' requests \
      'albumentations==1.4.10' 'albucore==0.0.13'

# 复制项目文件
COPY . .

# 安装为可编辑包（依赖已在上一层装好，--no-deps 避免再次解析并拉取完整 OpenCV）
RUN pip install --no-cache-dir --no-deps -e . -i https://mirrors.aliyun.com/pypi/simple/

# 确保输出目录存在
RUN mkdir -p ./src/generated

# 生成 gRPC 代码
RUN python -m grpc_tools.protoc \
    -I./proto \
    --python_out=./src/generated \
    --grpc_python_out=./src/generated \
    ./proto/graph_service.proto && \
    python -c "\
import re; \
f=open('src/generated/graph_service_pb2_grpc.py','r',encoding='utf-8'); \
content=f.read(); f.close(); \
content=re.sub(r'^import graph_service_pb2 as','from . import graph_service_pb2 as',content,flags=re.MULTILINE); \
f=open('src/generated/graph_service_pb2_grpc.py','w',encoding='utf-8'); \
f.write(content); f.close()"

EXPOSE 50051

CMD ["python", "main.py"]
