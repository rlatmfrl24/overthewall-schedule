import { createFileRoute } from "@tanstack/react-router";
import { OtwPlayClipsPage } from "@/features/otw-play";

export const Route = createFileRoute("/play/_catalog/clips/")({ component: OtwPlayClipsPage });
