export type ContactMode =
  | "any"
  | "phone"
  | "website"
  | "phone_website"
  | "no_website"
  | "phone_no_website";

export type Lead = {
  id: string;
  name: string;
  phone?: string;
  website?: string;
  email?: string;
  address?: string;
  city?: string;
  country: string;
  industry: string;
  latitude?: number;
  longitude?: number;
  mapsUrl: string;
  placeKey: string;
  searchQuery?: string;
  score: number;
  collectedAt: string;
};

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type HarvestJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  keyword: string;
  country: string;
  city?: string;
  region?: string;
  maxResults: number;
  workers: number;
  contactMode: ContactMode;
  progress: {
    collected: number;
    target: number;
    percent: number;
    message: string;
    stage: string;
  };
  leads: Lead[];
  error?: string;
};

export type StartHarvestInput = {
  keyword: string;
  country: string;
  city?: string;
  region?: string;
  maxResults: number;
  workers: number;
  contactMode: ContactMode;
};
