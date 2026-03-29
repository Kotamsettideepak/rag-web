import { memo } from "react";
import { User } from "lucide-react";

interface user_avatar_props {
  name?: string;
  imageUrl?: string;
}

export const UserAvatar = memo(function UserAvatar({ name, imageUrl }: user_avatar_props) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name || "User"} className="h-10 w-10 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
      <User size={18} />
    </div>
  );
});
