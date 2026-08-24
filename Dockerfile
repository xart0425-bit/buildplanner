# BuildPlanner — 어떤 Node 호스트에서도 뜨는 단일 컨테이너.
# DATABASE_URL 이 없으면 인메모리 저장소로 동작하므로, 데모 배포에는 DB가 없어도 됩니다.
FROM node:22-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# patches/ 는 pnpm 의 patchedDependencies 가 install 중에 읽으므로 먼저 복사합니다.
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 호스팅된 인스턴스는 서버 디스크를 노출하지 않습니다. 자세한 내용은 README 참고.
ENV ALLOW_LOCAL_FS=false

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/index.js"]
