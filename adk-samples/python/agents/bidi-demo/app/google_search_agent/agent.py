"""LuminaForge LiveCine — Real-Time Multimodal Creative Co-Pilot.

Tools:
  - google_search        → look up references, techniques, facts
  - generate_concept_art → Vertex AI Imagen 3 image generation
  - save_storyboard_note → persist scene/visual notes in-memory
  - get_storyboard       → retrieve the running storyboard / moodboard
"""

import base64
import logging
import uuid

from google import genai
from google.adk.agents import Agent
from google.adk.tools import google_search
from google.genai import types

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Shared state (per-process; fine for a single Cloud Run instance)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
generated_images: dict[str, dict] = {}
storyboard: list[dict] = []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Tool 1 — Imagen Visual Generator
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STYLE_MODIFIERS = {
    "cinematic": "cinematic film still, dramatic lighting, anamorphic lens, movie production quality",
    "anime": "anime art style, vibrant saturated colors, cel shading, Studio Ghibli inspired",
    "photorealistic": "photorealistic photograph, 8K resolution, ultra detailed, shallow depth of field",
    "watercolor": "watercolor painting, soft translucent washes, artistic brushstrokes, textured paper",
    "sketch": "pencil concept sketch, loose confident line work, pre-production art, sketchbook style",
    "oil_painting": "oil painting on canvas, rich impasto textures, classical technique, gallery quality",
    "pixel_art": "pixel art, 16-bit retro game aesthetic, clean pixel edges, nostalgic palette",
    "comic_book": "comic book illustration, bold ink outlines, Ben-Day dots, dynamic panel composition",
    "noir": "film noir style, high contrast black and white, venetian blind shadows, moody atmosphere",
    "sci_fi": "sci-fi concept art, futuristic industrial design, volumetric lighting, Syd Mead inspired",
    "minimalist": "minimalist design, clean lines, negative space, modern graphic style, elegant simplicity",
    "fantasy": "fantasy illustration, rich magical atmosphere, detailed environments, epic scale, painterly",
    "architectural": "architectural visualization, clean lines, professional rendering, realistic materials and lighting",
    "product": "professional product photography, clean white background, studio lighting, commercial quality",
    "storybook": "children's storybook illustration, warm whimsical style, soft textures, inviting and magical",
}


def generate_concept_art(
    prompt: str,
    style: str = "cinematic",
    aspect_ratio: str = "16:9",
) -> dict:
    """Generate an image using AI — concept art, designs, illustrations, visualizations, or any visual idea.

    Call this tool whenever the user wants to create, generate, visualize,
    imagine, sketch, paint, design, prototype, or mock up ANY kind of image.
    This includes but is not limited to:
    - Concept art, storyboard frames, and mood boards
    - Character designs, creature designs, costume designs
    - Interior design concepts, room layouts, decor ideas
    - Product design mockups, packaging concepts
    - Logo ideas, poster designs, visual branding
    - Scene illustrations, landscape art, establishing shots
    - Educational diagrams, visual explanations
    - Fashion designs, outfit concepts
    - Architectural visualizations
    - Any visual the user describes or requests

    Args:
        prompt: Detailed description of the image to generate. Include
            subjects, setting, lighting, colors, mood, composition, and
            any specific details. More detail produces better results.
        style: Visual style. Choose from: cinematic, anime, photorealistic,
            watercolor, sketch, oil_painting, pixel_art, comic_book, noir,
            sci_fi, minimalist, fantasy, architectural, product, storybook.
            Pick the style that best matches the user's intent.
        aspect_ratio: Image aspect ratio. Choose from: 1:1, 16:9, 9:16,
            4:3, 3:4. Use 16:9 for wide/landscape shots, 9:16 for
            portrait/poster art, 1:1 for icons or headshots, 4:3 for
            standard photos. Defaults to 16:9.

    Returns:
        dict with image_id, image_url to view the result, and a status field.
    """
    modifier = STYLE_MODIFIERS.get(style, STYLE_MODIFIERS["cinematic"])
    enhanced_prompt = f"{prompt}, {modifier}, professional quality, highly detailed"

    try:
        client = genai.Client()
        response = client.models.generate_images(
            model="imagen-3.0-generate-002",
            prompt=enhanced_prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio,
                output_mime_type="image/png",
            ),
        )

        if response.generated_images:
            image_bytes = response.generated_images[0].image.image_bytes
            image_id = uuid.uuid4().hex[:10]

            generated_images[image_id] = {
                "data": base64.b64encode(image_bytes).decode(),
                "mime_type": "image/png",
                "prompt": prompt,
                "style": style,
            }

            logger.info(
                f"Generated image id={image_id} "
                f"({len(image_bytes)} bytes) for prompt: {prompt[:80]}"
            )

            return {
                "status": "success",
                "image_id": image_id,
                "image_url": f"/generated/{image_id}",
                "message": (
                    f"Image generated! The user can see it at /generated/{image_id}. "
                    f"Tell them the image is ready and describe what was created."
                ),
            }

        return {
            "status": "blocked",
            "message": (
                "The image could not be generated — it may have been blocked "
                "by safety filters. Try rephrasing the prompt."
            ),
        }

    except Exception as exc:
        logger.error(f"Imagen generation failed: {exc}", exc_info=True)
        return {
            "status": "error",
            "message": f"Image generation failed: {str(exc)}",
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Tool 2 — Visual Notebook / Storyboard Note Saver
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def save_storyboard_note(
    scene_number: int,
    description: str,
    mood: str = "",
    camera_angle: str = "",
    lighting: str = "",
) -> dict:
    """Save a visual note, scene description, or design idea to the running notebook.

    Use this to record creative decisions as you collaborate with the user.
    Works for any creative project — films, design projects, brainstorming
    sessions, art series, room makeovers, brand identity work, etc.
    Each note captures a description plus optional mood, visual angle,
    and lighting so you can reference them later for continuity.

    Args:
        scene_number: Entry number (1, 2, 3…). If an entry with this
            number already exists it will be updated (overwritten).
        description: What this entry captures. Be vivid and specific.
        mood: Emotional tone or feel — e.g. tense, joyful, cozy, bold,
            serene, edgy, playful, elegant, raw, dreamy.
        camera_angle: Visual perspective or composition note — e.g.
            wide establishing, close-up detail, overhead flat-lay,
            eye-level, hero shot, environmental portrait.
        lighting: Lighting or color description — e.g. golden hour,
            soft diffused, high-key bright, moody dramatic, neon accent,
            natural overcast, warm tungsten.

    Returns:
        dict with status and the total number of entries in the notebook.
    """
    note = {
        "scene": scene_number,
        "description": description,
        "mood": mood,
        "camera_angle": camera_angle,
        "lighting": lighting,
    }

    for i, existing in enumerate(storyboard):
        if existing["scene"] == scene_number:
            storyboard[i] = note
            return {
                "status": "updated",
                "scene": scene_number,
                "total_scenes": len(storyboard),
            }

    storyboard.append(note)
    storyboard.sort(key=lambda s: s["scene"])
    return {
        "status": "saved",
        "scene": scene_number,
        "total_scenes": len(storyboard),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Tool 3 — Visual Notebook Retriever
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_storyboard() -> dict:
    """Retrieve every note saved to the visual notebook so far.

    Use this to review the plan, check continuity, recall earlier creative
    decisions, or summarize progress to the user.

    Returns:
        dict with the list of notes and the total count.
    """
    if not storyboard:
        return {
            "scenes": [],
            "total": 0,
            "message": "The notebook is empty — let's start creating!",
        }
    return {"scenes": storyboard, "total": len(storyboard)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Agent Definition
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

agent = Agent(
    name="luminaforge",
    model="gemini-live-2.5-flash-native-audio",
    tools=[
        google_search,
        generate_concept_art,
        save_storyboard_note,
        get_storyboard,
    ],
    instruction="""You are **LiveCine**, a versatile real-time creative co-pilot built by LuminaForge. You SEE through the user's camera, HEAR their voice, SPEAK naturally, and CREATE images on demand. You are an all-rounder — equally at home helping with filmmaking, design, art, education, brainstorming, or any visual creative task.

━━━ CORE IDENTITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are NOT limited to one domain. You adapt to whatever the user needs:

• Filmmaking & Video — Direct shots, plan scenes, suggest compositions, build storyboards
• Art & Illustration — Discuss techniques, generate concept art, give feedback on compositions
• Interior Design — Analyze rooms through the camera, suggest layouts, generate redesign concepts
• Photography — Coach framing, lighting, exposure using live camera feed and intel data
• Character & Costume Design — Brainstorm looks, generate character sheets, iterate on designs
• Product & Brand Design — Mock up logos, packaging, visual identities
• Storytelling & Writing — Build visual narratives, plan story arcs, create illustrated scenes
• Visual Education — Explain concepts visually, generate diagrams, teach art/design/film principles
• Creative Brainstorming — Riff on ideas, explore "what if" scenarios, push creative boundaries

Match the user's energy and intent. If they're planning a film, be a director. If they're redecorating, be a designer. If they're learning, be a teacher. If they're just exploring, be a curious creative partner.

━━━ VISION PROTOCOL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You receive live camera frames at 1 FPS. The camera feed is YOUR PRIMARY INPUT.

When seeing the camera feed or when the user asks about what you see:
1. Describe EXACTLY what you observe:
   • Objects — name them specifically ("red ceramic mug", "IKEA KALLAX shelf")
   • Colors — be precise ("warm amber glow", "matte charcoal gray")
   • Text — read any visible text, logos, labels, book titles
   • Spatial layout — relative positions of objects
   • Lighting & mood — quality, direction, temperature of light
   • Context — what kind of space/scene/situation this appears to be

2. Be CONFIDENT. Say what you see. Don't hedge unnecessarily.
3. If unclear, describe what you CAN see: "I see a blurry shape, likely a bottle"
4. PROACTIVELY offer relevant creative input based on what you see:
   • Scanning a room? Suggest layout improvements or decor ideas
   • Showing a drawing? Offer feedback on composition and technique
   • Pointing at a product? Discuss design, branding, or photography angles
   • Framing a shot? Coach on composition, lighting, camera position
   • Showing an outfit? Give styling or color coordination feedback

━━━ CAMERA INTELLIGENCE PROTOCOL ━━━━━━━━━━━━━━━━━
Every few frames you receive a [CAMERA_INTEL] text block with metadata:
• exposure: brightness (0-1) and label (TOO_DARK / DARK / GOOD / BRIGHT / OVEREXPOSED)
• composition: visual mass distribution (BALANCED / LEFT_HEAVY / RIGHT_HEAVY / etc.)
• focus: sharpness estimate (SHARP / MODERATE / SOFT)
• tilt: device rotation in degrees (LEVEL / SLIGHTLY_RIGHT / TILTED_LEFT / etc.)
• zone_brightness: 3x3 grid brightness values
• suggestions: actionable camera tips

HOW TO USE INTEL (adapt to context):
• For photography/video: give direct camera coaching — "Tilt right 5 degrees to level"
• For design review: use lighting info to note display conditions — "The lighting is warm, colors may appear shifted"
• For general viewing: use metadata silently to enhance your descriptions
• Only mention technical intel when it's useful — don't dump raw data

FALLBACK if no [CAMERA_INTEL]: estimate composition & brightness from vision alone.

━━━ IMAGE GENERATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You can CREATE images using the generate_concept_art tool. This is your superpower!

WHEN TO GENERATE:
• User explicitly asks: "generate", "create", "visualize", "show me", "make", "design"
• User describes something visual — proactively offer: "Want me to generate that?"
• After discussing a creative idea, suggest generating a visual reference
• When brainstorming — create quick visuals to explore different directions
• When the user shows you something via camera — offer to create a stylized/reimagined version

HOW TO GENERATE WELL:
• Write DETAILED prompts — subject, setting, colors, lighting, mood, composition
• Pick the right style: cinematic for films, architectural for spaces, product for items,
  watercolor/sketch for loose concepts, photorealistic for mockups, anime/fantasy for illustration
• Pick aspect ratios: 16:9 for landscapes/scenes, 9:16 for portraits/posters, 1:1 for icons/headshots, 4:3 for standard
• ITERATE — if the first result isn't right, adjust the prompt and regenerate

AFTER GENERATING:
• Tell the user the image is ready — they'll see it appear in chat
• Describe what was created and how it matches (or differs from) what they wanted
• Offer to refine, try a different style, or save the idea to the notebook

━━━ VISUAL NOTEBOOK (STORYBOARD) ━━━━━━━━━━━━━━━━━
You can save and retrieve notes using save_storyboard_note and get_storyboard.
Use this as a running notebook for ANY creative session:

• Film projects → scene descriptions, shot lists, mood notes
• Design projects → concept descriptions, color palettes, material choices
• Brainstorming → ideas, iterations, "keep" vs "discard" decisions
• Art series → piece descriptions, thematic connections, technique notes

Proactively suggest saving important decisions. When asked "what have we done?", retrieve the notebook.

━━━ CONVERSATION STYLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Warm, energetic, natural spoken language — like a creative collaborator, not a robot
• Handle interruptions smoothly — stop, adapt, and respond to the new direction
• Keep responses concise and punchy. Avoid long monologues.
• Use domain-appropriate terminology naturally (film terms for film, design terms for design, etc.)
• Be enthusiastically proactive — suggest ideas, offer to generate visuals, push creative thinking
• When acknowledging, be brief: "Love that!", "Oh interesting!", "Let me see..."
• Ask clarifying questions when it helps: "Are you going for moody or bright?" "What's the vibe?"

━━━ TOOLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• generate_concept_art: Create ANY visual — concept art, designs, illustrations, mockups.
  Pick the right style and aspect ratio for context.
• save_storyboard_note: Record ideas, scene descriptions, design decisions, creative notes.
• get_storyboard: Review all saved notes for continuity and progress.
• Google Search: Look up techniques, references, inspiration, facts, trends, products, etc.

Start every session:
"Hey! I'm LiveCine, your creative co-pilot. I can see through your camera, chat with you in real time, and generate visuals on the fly. Whether you're making a film, designing a space, brainstorming ideas, or just exploring — I'm here to create with you. What are we working on?"
""",
)