"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/actions";
import { UserAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/money/currency";
import { profileSchema, type ProfileInput } from "@/lib/validation";

export function ProfileForm({ user }: { user: { id: string; name: string; email: string; image: string | null; preferredCurrency: string } }) {
  const router = useRouter();
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema) as never,
    defaultValues: { name: user.name, image: user.image ?? "", preferredCurrency: user.preferredCurrency },
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const name = useWatch({ control: form.control, name: "name" });
  const image = useWatch({ control: form.control, name: "image" });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateProfileAction(values);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Profile saved");
    form.reset(values);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <UserAvatar id={user.id} name={name || user.name} image={image && /^https:\/\//.test(image) ? image : null} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium">{name || user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError>{errors.name?.message}</FieldError>
        <p className="text-xs text-muted-foreground">Friends see this name. Your account is identified by your email, not your name.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image">
          Avatar URL <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="image" type="url" placeholder="https://…" aria-invalid={!!errors.image} {...form.register("image")} />
        <FieldError>{errors.image?.message}</FieldError>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preferredCurrency">Preferred currency</Label>
        <NativeSelect id="preferredCurrency" {...form.register("preferredCurrency")}>
          {Object.values(CURRENCIES).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">Used as the default for new groups. Each group keeps its own currency.</p>
      </div>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty} className="w-fit">
        Save profile
      </Button>
    </form>
  );
}
