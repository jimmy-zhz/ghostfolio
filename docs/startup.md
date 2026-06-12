```shell


npm run database:setup
npm run start:server
npm run start:client
```
工作流程

方式1：使用预构建镜像（推荐生产环境）
# 只启动服务，不需要 build
docker compose -f docker/docker-compose.yml up -d

方式2：本地构建
# 先有 .env 文件，然后 build（但 build 不读取 .env）
docker compose -f docker/docker-compose.build.yml up -d --build

为什么 build 不需要

Dockerfile 中构建命令 npm run build:production 只做编译，不依赖数据库密码等配置。这些环境变量在容器运行时才被使用：

# docker-compose.yml
services:
ghostfolio:
env_file:
- ../.env    # 运行时加载

生产部署建议

# 1. 配置 .env
# 2. 直接拉取预构建镜像运行（无需 build）
docker compose -f docker/docker-compose.yml up -d

预构建镜像 docker.io/ghostfolio/ghostfolio:latest 已包含在 docker-compose.yml 中。

