// A Shared access row's reason in the terminal: a table row is one line, so a long reason draws its `short` words
// ("Not managed here.") and keeps the whole sentence as its name, with the short words out of the tree: the row's
// name reads the sentence once. Without `short` the sentence is cut to the room left beside the row's buttons (the
// kit RowNote's cut form: it gives way first, the buttons keep their width).
import { RowNote } from "@kit";
import { Box, Text } from "@term/prim";
import type * as Web from "./ShareNote";

export const shareNote: typeof Web.shareNote = (children, short) =>
  short && typeof children === "string" ? (
    <Box shrink={0} sem={{ name: children }}>
      {/* The drawn words are the sentence's stand-in: hidden from the tree, so the row reads the sentence once. */}
      <Text colour="muted" sem={{ hidden: true }}>{short}</Text>
    </Box>
  ) : (
    <RowNote cut>{children}</RowNote>
  );
