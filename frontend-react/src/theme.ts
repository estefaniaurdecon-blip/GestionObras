import { extendTheme, ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "light",
  useSystemColorMode: false,
};

const defaultBrand = {
  50: "#e3f6ec",
  100: "#b8e4cc",
  200: "#8dd3ad",
  300: "#62c18e",
  400: "#37b06f",
  500: "#00662b", // color principal urdecon
  600: "#005024",
  700: "#003a1b",
  800: "#002413",
  900: "#000e08",
};

const components = {
  Button: {
    baseStyle: {
      borderRadius: "md",
      fontWeight: "semibold",
    },
    sizes: {
      sm: {
        fontSize: "sm",
      },
      md: {
        fontSize: "sm",
      },
    },
    variants: {
      solid: {
        bg: "brand.500",
        color: "white",
        _hover: {
          bg: "brand.600",
        },
      },
      ghost: {
        color: "gray.700",
        _hover: {
          bg: "gray.100",
        },
      },
      outline: {
        borderColor: "brand.500",
        color: "brand.500",
        _hover: {
          bg: "brand.50",
        },
      },
    },
  },
  Card: {
    baseStyle: {
      borderRadius: "lg",
      boxShadow: "sm",
      borderWidth: "1px",
    },
  },
};

export const buildTheme = (brandPalette?: Record<string, string>) =>
  extendTheme({
    config,
    colors: {
      brand: {
        ...defaultBrand,
        ...(brandPalette ?? {}),
      },
      green: {
        ...defaultBrand,
        ...(brandPalette ?? {}),
      },
      blue: {
        ...defaultBrand,
        ...(brandPalette ?? {}),
      },
    },
    components,
    fonts: {
      heading: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
      body: "'IBM Plex Sans', 'Space Grotesk', sans-serif",
    },
  });

export const theme = buildTheme();
