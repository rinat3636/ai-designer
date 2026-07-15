import { Template as PrismaTemplate, Generation as PrismaGeneration, GenerationImage, SubscriptionPlan, BrandSettings } from "@prisma/client";

export type Template = PrismaTemplate;
export type Generation = PrismaGeneration & {
  images: GenerationImage[];
  template?: PrismaTemplate;
};
export type GenerationWithTemplate = PrismaGeneration & {
  images: GenerationImage[];
  template: PrismaTemplate;
};
export type Plan = SubscriptionPlan;
export type Brand = BrandSettings;

export type Concept = {
  name: string;
  description: string;
  explanation?: string;
  palette: string[];
  recommendations: string[];
};

export type Brief = {
  businessDesc: string;
  companyName: string;
  website?: string;
  targetAudience?: string;
  style?: string;
  colors?: string[];
  logoUrl?: string;
  [key: string]: any;
};
