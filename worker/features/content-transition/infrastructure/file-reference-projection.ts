import type {TransitionPlan} from "../../../../contracts/content-transition";
import {classifyFileReference} from "../../assets/commands";
import type {FileReferenceProjection} from "../domain/projected-content";

export function fileReferenceProjection(plan:TransitionPlan):FileReferenceProjection {
  return {projectReference(raw) {
    const reference=classifyFileReference(raw,plan);
    return reference.kind==="owned"?reference.path:reference.url;
  }};
}
