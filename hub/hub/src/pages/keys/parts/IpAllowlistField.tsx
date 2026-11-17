// The "Only from these addresses" field of New key / Edit (KeyFields) and Share realm (ShareDrawer): the kit
// IpAllowlistField (one Add my IP field on every page) with this page's own GET /ip read.
import { IpAllowlistField as KitIpAllowlistField, type IpAllowlistFieldProps as KitProps } from "@kit";
import { useReadMyIp } from "../data";

// The hold is always `isDisabled` here (the kit's deprecated `locked` name is not offered); Omit over the kit's
// either/or hold would merge its arms into one type no caller can satisfy.
export type IpAllowlistFieldProps = Omit<Extract<KitProps, { isDisabled: boolean }>, "readIp" | "multiline">;

export function IpAllowlistField(props: IpAllowlistFieldProps) {
  const readIp = useReadMyIp();
  return <KitIpAllowlistField {...props} readIp={readIp} />;
}
