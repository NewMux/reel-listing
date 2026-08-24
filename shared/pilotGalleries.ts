export const pilotGalleryIds = ["apartment", "villa"] as const;
export type PilotGalleryId = (typeof pilotGalleryIds)[number];

export type PilotGalleryImage = {
  id: string;
  name: string;
  url: string;
};

/** Owner-provided pilot assets for the private apartment and villa pilot galleries. */
export const pilotGalleries: Record<PilotGalleryId, PilotGalleryImage[]> = {
  apartment: [
    { id: "apartment-01", name: "Apartment 01", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/SQaFKhenBnrzpoBH.png" },
    { id: "apartment-02", name: "Apartment 02", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/mDNFGoMDLekGQiYT.png" },
    { id: "apartment-03", name: "Apartment 03", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/dOZyTneqTpWcYsce.png" },
    { id: "apartment-04", name: "Apartment 04", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/jTpKlkvReUGLSWay.png" },
    { id: "apartment-05", name: "Apartment 05", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/vHCgWoUKXlyUIKnb.png" },
    { id: "apartment-06", name: "Apartment 06", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/asbKvIqOXYxMaQdN.png" },
    { id: "apartment-07", name: "Apartment 07", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/WHZnDgKUCyAaLVcb.png" },
    { id: "apartment-08", name: "Apartment 08", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/APyFnrKPApTGuFUu.png" },
    { id: "apartment-09", name: "Apartment 09", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/tfgEOspPsOAsZkGO.png" },
  ],
  villa: [
    { id: "villa-01", name: "Villa 01", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/sMlHumgAyNVItCbn.png" },
    { id: "villa-02", name: "Villa 02", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/ouemzLCJjghKtiDM.png" },
    { id: "villa-03", name: "Villa 03", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/okZskcRdzTQwhipg.png" },
    { id: "villa-04", name: "Villa 04", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/IneBLAUGFSngpHgO.png" },
    { id: "villa-05", name: "Villa 05", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/JDNkeLsLCQRJEMaJ.png" },
    { id: "villa-06", name: "Villa 06", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/GXKzzPpdurVoTtEp.png" },
    { id: "villa-07", name: "Villa 07", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/PGdUMtcgqzYirMQf.png" },
    { id: "villa-08", name: "Villa 08", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/QlMuVmpmrQQJCypK.png" },
    { id: "villa-09", name: "Villa 09", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/OzDttuAwFrUZpFVK.png" },
    { id: "villa-10", name: "Villa 10", url: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663888332219/OGRXHSJAwlvxSeEY.png" },
  ],
};

export function getPilotGallery(gallery: PilotGalleryId) {
  return pilotGalleries[gallery];
}
