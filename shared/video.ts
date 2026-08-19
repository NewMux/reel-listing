export const projectStatuses = ["Uploading", "Processing", "Review", "Done"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectMedia = {
  name: string;
  type: string;
  url: string;
};

export const MAX_PROPERTY_MEDIA_BYTES = 25 * 1024 * 1024;
export const MIN_PROPERTY_IMAGES = 3;
export const MAX_PROPERTY_IMAGES = 10;
