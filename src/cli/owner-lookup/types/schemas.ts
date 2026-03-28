import { z } from "zod";

export const CliArgsSchema = z.object({
  name: z.string().min(1),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

// --- PRH API response schemas ---

const PrhBusinessIdSchema = z.object({
  value: z.string(),
  registrationDate: z.string().optional(),
  source: z.string().optional(),
});

const PrhNameSchema = z.object({
  name: z.string(),
  type: z.string(),
  registrationDate: z.string().optional(),
  endDate: z.string().optional(),
  version: z.number().optional(),
  source: z.string().optional(),
});

const PrhDescriptionSchema = z.object({
  languageCode: z.string(),
  description: z.string(),
});

const PrhMainBusinessLineSchema = z
  .object({
    type: z.string().optional(),
    descriptions: z.array(PrhDescriptionSchema).default([]),
    typeCodeSet: z.string().optional(),
    registrationDate: z.string().optional(),
    source: z.string().optional(),
  })
  .nullable();

const PrhCompanyFormSchema = z.object({
  type: z.string().optional(),
  descriptions: z.array(PrhDescriptionSchema).default([]),
  registrationDate: z.string().optional(),
  version: z.number().optional(),
  source: z.string().optional(),
});

const PrhPostOfficeSchema = z.object({
  city: z.string().optional(),
  languageCode: z.string().optional(),
  municipalityCode: z.string().optional(),
});

const PrhAddressSchema = z.object({
  type: z.number().optional(),
  street: z.string().optional(),
  postCode: z.string().optional(),
  buildingNumber: z.string().optional(),
  postOfficeBox: z.string().optional(),
  postOffices: z.array(PrhPostOfficeSchema).default([]),
  registrationDate: z.string().optional(),
  source: z.string().optional(),
});

const PrhCompanySchema = z
  .object({
    businessId: PrhBusinessIdSchema,
    names: z.array(PrhNameSchema).default([]),
    mainBusinessLine: PrhMainBusinessLineSchema.optional(),
    companyForms: z.array(PrhCompanyFormSchema).default([]),
    addresses: z.array(PrhAddressSchema).default([]),
    registrationDate: z.string().optional(),
    status: z.string().optional(),
    lastModified: z.string().optional(),
  })
  .loose();

export const PrhApiResponseSchema = z.object({
  totalResults: z.number(),
  companies: z.array(PrhCompanySchema).default([]),
});

export type PrhApiResponse = z.infer<typeof PrhApiResponseSchema>;
export type PrhCompany = z.infer<typeof PrhCompanySchema>;
export type PrhName = z.infer<typeof PrhNameSchema>;
