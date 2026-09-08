import type { Metadata } from "next";
import { UpdatesClient } from "./updates-client";

export const metadata: Metadata = { title:"更新履歴 | METEOR RACE", description:"METEOR RACEの機能追加・改善・不具合修正の履歴です。" };

export default function UpdatesPage() {
  return <UpdatesClient />;
}
