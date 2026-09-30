import { PageHeader } from "@/components/PageHeader";
import { NotFoundState } from "@/components/NotFoundState";

// notFound() from a cook or profile page: keeps the tab bar, adds back.
export default function NotFound() {
  return (
    <>
      <PageHeader title="" back />
      <NotFoundState />
    </>
  );
}
