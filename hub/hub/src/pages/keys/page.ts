// Manifest of the keys page (PageManifest, src/kit/page.ts). A security-sensitive page.
import { definePage } from "@kit";
import strings from "./strings.en.json";

export default definePage({
  id: "keys",
  path: "/keys",
  title: "title",
  description:
    "API keys, the SSH key of a computer and shared access, for people and agents that act for you.",
  nav: { group: "main", order: 100, icon: "hoody-private-key", label: "nav" },
  layout: 'list-detail',
  load: () => import("./view"),
  status: 'ready',
  sensitive: true,
  strings,
  commands: [
    { id: "open", label: "cmd.open" },
    { id: "new", label: "cmd.new" },
    { id: "ssh", label: "cmd.ssh" },
    { id: "share", label: "cmd.share" },
  ],
});
