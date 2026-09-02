CREATE TABLE "contact_messages" (
  "id" serial PRIMARY KEY,
  "name" varchar(160) NOT NULL,
  "email" varchar(320) NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;
