export { prisma } from "./client";
export { prisma as db } from "./client";
export * from "@prisma/client";
export {
  getAgencyCredentials,
  getAgencySettingsStatus,
  updateAgencySettings,
  type AgencyCredentials,
  type AgencySettingsStatus,
  type UpdateAgencySettingsInput,
} from "./credentials";
