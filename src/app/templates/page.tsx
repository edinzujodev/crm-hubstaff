import { redirect } from "next/navigation";

// Templates now live on the Config page.
export default function TemplatesPage() {
  redirect("/config");
}
