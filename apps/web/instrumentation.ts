import { registerOTel } from "@vercel/otel";

// Traces go to GitLab Observability over OTLP/HTTP when
// OTEL_EXPORTER_OTLP_ENDPOINT (and OTEL_EXPORTER_OTLP_HEADERS for its token)
// are set; without them nothing is registered, so builds and tests need
// no collector. Next.js then adds its own spans for every request.
export const register = () => {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (endpoint === undefined || endpoint === "") {
    return;
  }
  const version =
    process.env["VERCEL_GIT_COMMIT_SHA"] ?? process.env["CI_COMMIT_SHA"];
  registerOTel({
    attributes: {
      "deployment.environment.name": process.env["VERCEL_ENV"] ?? "development",
      "gitlab.project.id": 87_296_573,
      "gitlab.project.name": "showcase",
      ...(version === undefined ? {} : { "service.version": version }),
    },
    serviceName: "wovain",
  });
};
