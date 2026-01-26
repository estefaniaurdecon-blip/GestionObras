import React from "react";
import { Box, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";

interface HeroItem {
  label: string;
  value: string | number;
}

interface ProjectHeroProps {
  items: HeroItem[];
  title: string;
  subtitle: string;
  animation?: string;
}

export const ProjectHero: React.FC<ProjectHeroProps> = ({
  items,
  title,
  subtitle,
  animation,
}) => (
  <Box
    borderRadius="2xl"
    p={{ base: 6, md: 8 }}
    bgGradient="linear(120deg, #0f3d2e 0%, #0c6b3f 55%, #caa85b 110%)"
    color="white"
    boxShadow="lg"
    position="relative"
    overflow="hidden"
    animation={animation}
    mb={6}
  >
    <Box
      position="absolute"
      inset="0"
      opacity={0.16}
      bgImage="radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4), transparent 55%)"
    />

    <Stack position="relative" spacing={4}>
      <Stack spacing={1}>
        <Heading size="lg">{title}</Heading>
        <Text color="whiteAlpha.800">{subtitle}</Text>
      </Stack>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {items.map((item) => (
          <Box key={item.label} p={4} borderRadius="lg" bg="whiteAlpha.100">
            <Text
              fontSize="xs"
              textTransform="uppercase"
              color="whiteAlpha.800"
            >
              {item.label}
            </Text>
            <Heading size="md" mt={1}>
              {item.value}
            </Heading>
          </Box>
        ))}
      </SimpleGrid>
    </Stack>
  </Box>
);
