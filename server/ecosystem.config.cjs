module.exports = {
  apps: [
    {
      name: "likeuu-server",
      script: "dist/index.js",
      cwd: "/srv/likeuu/server",
      env: {
        NODE_ENV: "production",
        PORT: "8787",
        HOST: "127.0.0.1"
      }
    }
  ]
};
