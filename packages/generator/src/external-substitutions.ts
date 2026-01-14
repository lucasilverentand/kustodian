import type {
  DopplerSubstitutionType,
  OnePasswordSubstitutionType,
  SubstitutionType,
  TemplateType,
} from '@kustodian/schema';
import { is_doppler_substitution, is_onepassword_substitution } from '@kustodian/schema';

/**
 * Extracts 1Password substitutions from templates.
 */
export function extract_onepassword_substitutions(
  templates: TemplateType[],
): OnePasswordSubstitutionType[] {
  const substitutions: OnePasswordSubstitutionType[] = [];

  for (const template of templates) {
    for (const kustomization of template.spec.kustomizations) {
      for (const sub of kustomization.substitutions ?? []) {
        if (is_onepassword_substitution(sub)) {
          substitutions.push(sub);
        }
      }
    }
  }

  return substitutions;
}

/**
 * Extracts Doppler substitutions from templates.
 */
export function extract_doppler_substitutions(
  templates: TemplateType[],
): DopplerSubstitutionType[] {
  const substitutions: DopplerSubstitutionType[] = [];

  for (const template of templates) {
    for (const kustomization of template.spec.kustomizations) {
      for (const sub of kustomization.substitutions ?? []) {
        if (is_doppler_substitution(sub)) {
          substitutions.push(sub);
        }
      }
    }
  }

  return substitutions;
}

/**
 * Extracts all external substitutions (1Password and Doppler) from templates.
 */
export function extract_external_substitutions(templates: TemplateType[]): {
  onepassword: OnePasswordSubstitutionType[];
  doppler: DopplerSubstitutionType[];
} {
  return {
    onepassword: extract_onepassword_substitutions(templates),
    doppler: extract_doppler_substitutions(templates),
  };
}

/**
 * Checks if a substitution requires external resolution.
 */
export function is_external_substitution(sub: SubstitutionType): boolean {
  return is_onepassword_substitution(sub) || is_doppler_substitution(sub);
}
