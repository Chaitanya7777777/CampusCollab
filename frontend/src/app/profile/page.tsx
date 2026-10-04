import { ProfileEditor } from "@/components/profile-editor";
import { ApiProfileEditor } from "@/components/api-profile";
import { API_MODE } from "@/lib/app-mode";
export default function ProfilePage() {
  return API_MODE ? <ApiProfileEditor /> : <ProfileEditor />;
}
