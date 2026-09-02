import { redirect } from "next/navigation";

/** Tidak ada landing page (PRD): halaman utama aplikasi adalah login. */
export default function Home() {
  redirect("/login");
}
