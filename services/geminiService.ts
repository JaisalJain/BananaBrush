
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const processImageResponse = (response: GenerateContentResponse): string => {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image was generated. The model might have refused the request.");
};


export const editImageWithText = async (
  prompt: string,
  originalImageBase64: string,
  maskImageBase64: string,
  originalMimeType: string,
  systemContext?: string
): Promise<string> => {
  try {
    const baseInstruction = `You are an expert image editor. The user has provided an image and a selection mask. Modify the original image ONLY in the area specified by the white part of the selection mask. The rest of the image must remain untouched. The user's instruction is: "${prompt}". Output only the final edited image without any additional text.`;
    const finalInstruction = systemContext
        ? `You are an expert in ${systemContext}. ${baseInstruction}`
        : baseInstruction;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: [
          {
            text: finalInstruction,
          },
          {
            inlineData: {
              data: originalImageBase64,
              mimeType: originalMimeType,
            },
          },
          {
             inlineData: {
              data: maskImageBase64,
              mimeType: 'image/png',
            },
          }
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    return processImageResponse(response);

  } catch (error) {
    console.error("Error editing image:", error);
    if (error instanceof Error) {
        return Promise.reject(new Error(`Failed to edit image: ${error.message}`));
    }
    return Promise.reject(new Error("An unknown error occurred while editing the image."));
  }
};

export const blendImages = async (
  originalImageBase64: string,
  compositeImageBase64: string,
  maskBase64: string,
  originalMimeType: string,
  compositeMimeType: string
): Promise<string> => {
  try {
    const instruction = `You are an elite AI digital artist and compositor, specializing in creating hyper-realistic images that are indistinguishable from real photographs.

Your task is to perform a master-level composite, seamlessly integrating a subject from one image into a background scene from another. The final result must be a single, cohesive, and photorealistic image.

You have been provided with three images:
1.  **Original Image:** The main background scene.
2.  **Composite Image:** This shows the Original Image with a new object/subject crudely pasted on top. This is for placement reference only.
3.  **Mask:** A black and white image where the white area precisely marks the location of the pasted object.

Execute the following steps with artistic precision:

1.  **IDENTIFY & EXTRACT:** Use the Mask on the Composite Image to identify the subject. Perform a perfect "deep etch" cutout of this subject, removing 100% of its original background. There must be absolutely NO edge halos, glows, or color fringing. The edges must be perfect.

2.  **ANALYZE THE SCENE:** Meticulously study the **Original Image** to understand its physical properties:
    *   **Lighting:** Identify all light sources. Note their direction, color, intensity, and whether they are hard or soft.
    *   **Environment:** Analyze the textures, materials, and overall mood of the scene.

3.  **INTEGRATE & GROUND THE SUBJECT:** This is the most critical phase. You must make the subject a believable part of the scene by creating realistic interactions between it and the background. This will involve modifying BOTH the subject AND the background pixels where they interact.
    *   **Relight the Subject:** Adjust the subject's lighting to perfectly match the direction, color, and quality of the light in the Original Image.
    *   **Cast Shadows:** Realistically render shadows cast by the subject onto the background. This includes soft ambient occlusion shadows where the subject is close to other surfaces and harder cast shadows from the primary light source. The shadow's properties (blurriness, color, density) must match existing shadows in the scene.
    *   **Create Reflections:** If the subject is on or near a reflective surface (like water, metal, or polished floors), you must render accurate reflections onto that surface.
    *   **Match Scene Properties:** Adjust the subject's color balance, saturation, black levels, grain, and sharpness to perfectly match the background image.

4.  **FINAL OUTPUT:**
    *   Your output MUST be a single image.
    *   This image is the **Original Image** seamlessly modified with the integrated subject.
    *   The pasted object from the Composite Image must be completely gone, replaced by your perfectly blended version. The background must be modified to include the new shadows and reflections.
    *   The area of the Original Image far from the new subject must remain untouched.

Output only the final, photorealistic image. Do not include any text.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                { text: instruction },
                { inlineData: { data: originalImageBase64, mimeType: originalMimeType } },
                { inlineData: { data: compositeImageBase64, mimeType: compositeMimeType } },
                { inlineData: { data: maskBase64, mimeType: 'image/png' } },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    return processImageResponse(response);
  } catch (error) {
    console.error("Error blending image:", error);
    if (error instanceof Error) {
        return Promise.reject(new Error(`Failed to blend image: ${error.message}`));
    }
    return Promise.reject(new Error("An unknown error occurred while blending the image."));
  }
};

export const expandImage = async (
  prompt: string,
  compositeImageBase64: string,
  compositeMimeType: string
): Promise<string> => {
  try {
    const instruction = `You are an expert AI image editor specializing in outpainting (image expansion). You will be given a composite image that has an original photo in the center and a solid gray (#808080) area around it.

Your task is to do two things simultaneously:
1.  **Extend the Scene:** Intelligently continue the scene from the original photo into the gray area. The extension MUST be perfectly seamless and consistent with the original photo's style, lighting, color, perspective, shadows, and textures.
2.  **Incorporate the User's Request:** While extending the scene, you must also incorporate the user's request for what should appear in the newly generated area.

**User's request for the expanded area:** "${prompt}"

**CRITICAL INSTRUCTIONS:**

1.  **DO NOT TOUCH THE ORIGINAL IMAGE:** The original photo in the center of the canvas is sacred. You MUST NOT modify, alter, or edit it in any way. Not a single pixel. Your work is confined ONLY to the gray (#808080) area.
2.  **CONSISTENCY IS PARAMOUNT:** The generated content in the gray area must look like a natural continuation of the original photo. If the user asks for "a swimming pool", you must draw a swimming pool that fits perfectly into the existing scene's environment, lighting, and perspective. Do not just draw a separate image of a swimming pool. It must feel like it was part of the original photograph.
3.  **SEAMLESS BLENDING:** The boundary between the original image and your generated content must be invisible.
4.  **INTELLIGENT INTERPRETATION:** Interpret the user's prompt ("${prompt}") as instructions for what to add *within the context of the extended scene*. For example, if the original image is a backyard and the prompt is "a dog", you add a dog that logically belongs in that backyard, matching the lighting and style.
5.  **OUTPUT:** Provide only the final, complete image as your output. No text, no conversation.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                { text: instruction },
                { inlineData: { data: compositeImageBase64, mimeType: compositeMimeType } },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    return processImageResponse(response);

  } catch (error) {
    console.error("Error expanding image:", error);
    if (error instanceof Error) {
        return Promise.reject(new Error(`Failed to expand image: ${error.message}`));
    }
    return Promise.reject(new Error("An unknown error occurred while expanding the image."));
  }
};


export const generateImage = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '1:1',
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/png;base64,${base64ImageBytes}`;
    }

    throw new Error("No image was generated by the model. Please try a different prompt.");
  } catch (error) {
    console.error("Error generating image:", error);
    if (error instanceof Error) {
      return Promise.reject(new Error(`Failed to generate image: ${error.message}`));
    }
    return Promise.reject(new Error("An unknown error occurred while generating the image."));
  }
};