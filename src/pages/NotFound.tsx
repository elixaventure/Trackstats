import { LinkButton } from "@/components/Button";
import { EmptyState } from "@/components/States";

export default function NotFound() {
  return <EmptyState title="Page not found" action={<LinkButton to="/" variant="primary">Go home</LinkButton>}>That link doesn't go anywhere.</EmptyState>;
}
