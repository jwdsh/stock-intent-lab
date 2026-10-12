import { Workbench } from "@/components/workbench";

export default function Home() {
  return <Workbench dataMode={process.env.DATA_MODE === "live" ? "live" : "demo"} />;
}
