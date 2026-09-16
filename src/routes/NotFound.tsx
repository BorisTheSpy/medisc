import { useNavigate } from "react-router";
import { Button, EmptyState } from "@/components/ui";

export function NotFoundRoute() {
  const nav = useNavigate();
  return <EmptyState title="Nothing here" body="That page does not exist." action={<Button variant="brand" onClick={() => nav("/")}>Go home</Button>} />;
}
