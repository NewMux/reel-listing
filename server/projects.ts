import {
  MAX_PROPERTY_IMAGES,
  MAX_PROPERTY_MEDIA_BYTES,
  MIN_PROPERTY_IMAGES,
  projectStatuses,
} from "../shared/video";

export const acceptedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
] as const;

export type UploadCandidate = {
  name: string;
  type: string;
  base64: string;
};

export type UploadedMedia = {
  name: string;
  type: string;
  key: string;
  url: string;
};

export function decodeBase64Media(data: string): Buffer {
  const normalized = data.replace(/^data:[^;]+;base64,/, "");
  if (!normalized || !/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new Error("The uploaded media could not be read.");
  }
  return Buffer.from(normalized, "base64");
}

export function validatePropertyMedia(files: UploadCandidate[]) {
  if (files.length === 0) throw new Error("Add property media to continue.");
  if (files.length > MAX_PROPERTY_IMAGES) {
    throw new Error(`You can upload a maximum of ${MAX_PROPERTY_IMAGES} images.`);
  }

  const hasVideo = files.some(file => file.type.startsWith("video/"));
  const hasImage = files.some(file => file.type.startsWith("image/"));
  if (hasVideo && hasImage) {
    throw new Error("Upload either one walkthrough video or a set of property images, not both.");
  }
  if (hasVideo && files.length !== 1) {
    throw new Error("Upload one walkthrough video at a time.");
  }
  if (hasImage && files.length < MIN_PROPERTY_IMAGES) {
    throw new Error(`Add at least ${MIN_PROPERTY_IMAGES} property images to continue.`);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!acceptedMediaTypes.includes(file.type as (typeof acceptedMediaTypes)[number])) {
      throw new Error("Use JPG, PNG, WEBP, MP4, or MOV media files.");
    }
    const bytes = decodeBase64Media(file.base64);
    totalBytes += bytes.byteLength;
  }

  if (totalBytes > MAX_PROPERTY_MEDIA_BYTES) {
    throw new Error("Keep the combined upload size under 25 MB.");
  }

  return { totalBytes, isVideo: hasVideo };
}

export function validateUploadedPropertyMedia(files: UploadedMedia[]) {
  if (files.length === 0) throw new Error("Add property media to continue.");
  if (files.length > MAX_PROPERTY_IMAGES) {
    throw new Error(`You can upload a maximum of ${MAX_PROPERTY_IMAGES} images.`);
  }

  const hasVideo = files.some(file => file.type.startsWith("video/"));
  const hasImage = files.some(file => file.type.startsWith("image/"));
  if (hasVideo && hasImage) {
    throw new Error("Upload either one walkthrough video or a set of property images, not both.");
  }
  if (hasVideo && files.length !== 1) {
    throw new Error("Upload one walkthrough video at a time.");
  }
  if (hasImage && files.length < MIN_PROPERTY_IMAGES) {
    throw new Error(`Add at least ${MIN_PROPERTY_IMAGES} property images to continue.`);
  }

  for (const file of files) {
    if (!acceptedMediaTypes.includes(file.type as (typeof acceptedMediaTypes)[number])) {
      throw new Error("Use JPG, PNG, WEBP, MP4, or MOV media files.");
    }
    if (!file.key.startsWith("property-projects/") || !file.url.startsWith("/manus-storage/")) {
      throw new Error("Property media must be uploaded securely before creating a project.");
    }
  }

  return { isVideo: hasVideo };
}

export function isProjectStatus(value: string): value is (typeof projectStatuses)[number] {
  return projectStatuses.includes(value as (typeof projectStatuses)[number]);
}

export function getApprovalTransition(status: string) {
  if (status !== "Review") {
    throw new Error("This project is already in production.");
  }
  return { status: "Processing" as const, revisionNotes: null };
}

export function getChangeRequestTransition(notes: string) {
  const revisionNotes = notes.trim();
  if (revisionNotes.length < 3) {
    throw new Error("Describe the change in at least three characters.");
  }
  return { status: "Review" as const, revisionNotes };
}

export function getCompletionTransition(finalVideoUrl: string) {
  if (!finalVideoUrl.startsWith("/manus-storage/") && !finalVideoUrl.startsWith("https://")) {
    throw new Error("Final delivery must use a secure media URL.");
  }
  return { status: "Done" as const, finalVideoUrl };
}
