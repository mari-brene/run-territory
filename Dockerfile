FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
RUN npm ci --workspaces --include-workspace-root
COPY packages packages
COPY apps/server apps/server
EXPOSE 3000
CMD ["npm", "start", "-w", "@run-territory/server"]
