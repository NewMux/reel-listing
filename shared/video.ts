export const projectStatuses = ["Uploading", "Processing", "Review", "Done"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectMedia = {
  name: string;
  type: string;
  url: string;
};

export const MAX_PROPERTY_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_PROPERTY_PHOTOS = 10;
/** @deprecated Use MAX_PROPERTY_PHOTOS for the upper bound. */
export const REQUIRED_PROPERTY_IMAGES = MAX_PROPERTY_PHOTOS;
