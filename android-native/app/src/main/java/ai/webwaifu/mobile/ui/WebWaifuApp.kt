package ai.webwaifu.mobile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.webwaifu.mobile.WaifuViewModel
import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.BUNDLED_ANIMATION_CLIPS
import ai.webwaifu.mobile.model.BUNDLED_VRM_MODELS
import ai.webwaifu.mobile.model.CameraViewMode
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.DEFAULT_PERSONAS
import ai.webwaifu.mobile.model.FishLatency
import ai.webwaifu.mobile.model.FishLiveChunkingStrategy
import ai.webwaifu.mobile.model.FishVoiceScope
import ai.webwaifu.mobile.model.LipSyncMode
import ai.webwaifu.mobile.model.MessageRole
import ai.webwaifu.mobile.model.OpenRouterRouting
import ai.webwaifu.mobile.model.ReplyLength
import ai.webwaifu.mobile.model.ReplyEmotion
import ai.webwaifu.mobile.model.RemoteTtsVoice
import ai.webwaifu.mobile.model.VercelRouting
import ai.webwaifu.mobile.model.WaifuUiState
import ai.webwaifu.mobile.ui.theme.WaifuCyan
import ai.webwaifu.mobile.ui.theme.WaifuInk
import ai.webwaifu.mobile.ui.theme.WaifuPeach
import ai.webwaifu.mobile.ui.theme.WaifuPink
import kotlin.math.sin

@Composable
fun WebWaifuApp(viewModel: WaifuViewModel) {
    val state by viewModel.uiState.collectAsState()
    val backupLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            uri?.let(viewModel::importLocalTransferBackup)
        }
    val vrmLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            uri?.let(viewModel::importVrm)
        }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = WaifuInk,
    ) {
        Box(Modifier.fillMaxSize()) {
            AvatarStage(
                state = state,
                modifier =
                    Modifier
                        .fillMaxSize()
                        .padding(top = 92.dp, bottom = 160.dp),
            )

            AppHeader(
                state = state,
                onSettings = { viewModel.setSettingsOpen(true) },
                onPersonaSelected = viewModel::selectPersona,
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding(),
            )

            ConversationPanel(
                state = state,
                onDraftChange = viewModel::setDraft,
                onSend = viewModel::send,
                onStop = viewModel::stop,
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp),
            )

            if (state.settingsOpen) {
                SettingsSheet(
                    state = state,
                    onDismiss = viewModel::dismissSettings,
                    onSave = viewModel::saveSettings,
                    onSaveProviderKey = viewModel::saveProviderKey,
                    onClearProviderKey = viewModel::clearProviderKey,
                    onSaveFishKey = viewModel::saveFishKey,
                    onClearFishKey = viewModel::clearFishKey,
                    onImportBackup = {
                        backupLauncher.launch(arrayOf("application/json", "text/plain"))
                    },
                    onImportVrm = {
                        vrmLauncher.launch(
                            arrayOf("model/gltf-binary", "application/octet-stream", "*/*"),
                        )
                    },
                    onSelectVrm = viewModel::selectVrm,
                    onDeleteVrm = viewModel::deleteVrm,
                    onResetExpression = viewModel::resetExpression,
                    onPreviewAvatarSettings = viewModel::previewAvatarSettings,
                    onPreviewModels = viewModel::refreshModels,
                    onPreviewVercelEndpoints = viewModel::refreshVercelEndpoints,
                    onRefreshFishVoices = viewModel::refreshFishVoices,
                    onSaveMemoryProfile = viewModel::saveMemoryProfile,
                    onClearMemory = viewModel::clearMemory,
                    onClearChat = viewModel::clearChat,
                )
            }
        }
    }
}

@Composable
private fun AppHeader(
    state: WaifuUiState,
    onSettings: () -> Unit,
    onPersonaSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = "WEBWAIFU",
                color = Color.White,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp,
                fontSize = 15.sp,
            )
            Text(
                text = "${state.settings.provider.displayName} · ${state.status}",
                color = if (state.error == null) WaifuPeach else MaterialTheme.colorScheme.error,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        CompactPersonaDropdown(
            selectedId = state.settings.activePersonaId,
            onSelected = onPersonaSelected,
        )
        Spacer(Modifier.width(6.dp))
        IconButton(onClick = onSettings) {
            Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Color.White)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CompactPersonaDropdown(
    selectedId: String,
    onSelected: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = DEFAULT_PERSONAS.firstOrNull { it.id == selectedId } ?: DEFAULT_PERSONAS.first()
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        Surface(
            modifier = Modifier.menuAnchor(),
            shape = RoundedCornerShape(50),
            color = Color.Black.copy(alpha = 0.46f),
            border =
                androidx.compose.foundation.BorderStroke(
                    1.dp,
                    WaifuPink.copy(alpha = 0.42f),
                ),
        ) {
            Row(
                modifier = Modifier.padding(start = 10.dp, end = 5.dp, top = 7.dp, bottom = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = selected.name,
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Icon(
                    Icons.Default.KeyboardArrowDown,
                    contentDescription = "Choose personality",
                    tint = WaifuPeach,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DEFAULT_PERSONAS.forEach { persona ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(persona.name, fontWeight = FontWeight.Bold)
                            Text(
                                persona.description,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    onClick = {
                        expanded = false
                        onSelected(persona.id)
                    },
                )
            }
        }
    }
}

@Composable
private fun AvatarStage(
    state: WaifuUiState,
    modifier: Modifier = Modifier,
) {
    HybridVrmStage(
        state = state,
        modifier = modifier,
    )
}

@Composable
private fun LegacyAvatarStage(
    state: WaifuUiState,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "avatar-idle")
    val idle by
        transition.animateFloat(
            initialValue = -1f,
            targetValue = 1f,
            animationSpec =
                infiniteRepeatable(
                    animation = tween(2600),
                    repeatMode = RepeatMode.Reverse,
                ),
            label = "idle",
        )
    val mouth by
        animateFloatAsState(
            targetValue =
                if (state.isSpeaking) {
                    (0.18f + state.speechAmplitude * 0.82f).coerceIn(0.12f, 1f)
                } else {
                    0.08f
                },
            animationSpec = tween(70),
            label = "mouth",
        )
    val emotionColor = emotionColor(state.emotion)

    Canvas(
        modifier =
            modifier.background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF110B1A),
                        Color(0xFF261020),
                        WaifuInk,
                    ),
                ),
            ),
    ) {
        val centerX = size.width / 2f
        val unit = size.minDimension / 10f
        val bob = idle * unit * 0.08f

        drawCircle(
            brush =
                Brush.radialGradient(
                    listOf(emotionColor.copy(alpha = 0.24f), Color.Transparent),
                    center = Offset(centerX, size.height * 0.48f),
                    radius = unit * 4.8f,
                ),
            radius = unit * 4.8f,
            center = Offset(centerX, size.height * 0.48f),
        )
        drawCircle(
            color = WaifuCyan.copy(alpha = 0.08f),
            radius = unit * 0.8f,
            center = Offset(size.width * 0.12f, size.height * 0.34f + bob),
        )
        drawCircle(
            color = WaifuPink.copy(alpha = 0.1f),
            radius = unit * 1.1f,
            center = Offset(size.width * 0.88f, size.height * 0.58f - bob),
        )

        val hairPath =
            Path().apply {
                moveTo(centerX - unit * 2.35f, size.height * 0.31f + bob)
                quadraticBezierTo(
                    centerX,
                    size.height * 0.02f + bob,
                    centerX + unit * 2.35f,
                    size.height * 0.31f + bob,
                )
                lineTo(centerX + unit * 2.65f, size.height * 0.92f)
                quadraticBezierTo(
                    centerX,
                    size.height * 0.78f,
                    centerX - unit * 2.65f,
                    size.height * 0.92f,
                )
                close()
            }
        drawPath(
            path = hairPath,
            brush =
                Brush.verticalGradient(
                    listOf(Color(0xFF371D42), Color(0xFF130D1B)),
                    startY = size.height * 0.08f,
                    endY = size.height,
                ),
        )

        drawOval(
            color = Color(0xFFFFE0D2),
            topLeft = Offset(centerX - unit * 1.62f, size.height * 0.23f + bob),
            size = Size(unit * 3.24f, unit * 4.05f),
        )
        drawArc(
            color = Color(0xFFFFB59B).copy(alpha = 0.58f),
            startAngle = 8f,
            sweepAngle = 164f,
            useCenter = false,
            topLeft = Offset(centerX - unit * 1.25f, size.height * 0.33f + bob),
            size = Size(unit * 2.5f, unit * 2.25f),
            style = Stroke(unit * 0.08f, cap = StrokeCap.Round),
        )

        val eyeY = size.height * 0.44f + bob
        val eyeOffset = unit * 0.73f
        val eyeScale =
            when (state.emotion.name) {
                "happy", "caring" -> 0.72f
                "surprised" -> 1.2f
                else -> 1f
            }
        listOf(centerX - eyeOffset, centerX + eyeOffset).forEach { eyeX ->
            drawOval(
                color = Color.White,
                topLeft = Offset(eyeX - unit * 0.34f, eyeY - unit * 0.2f * eyeScale),
                size = Size(unit * 0.68f, unit * 0.4f * eyeScale),
            )
            drawCircle(
                color = Color(0xFF5B244F),
                radius = unit * 0.16f,
                center = Offset(eyeX + idle * unit * 0.025f, eyeY),
            )
            drawCircle(
                color = Color.White,
                radius = unit * 0.045f,
                center = Offset(eyeX + unit * 0.04f, eyeY - unit * 0.05f),
            )
        }

        val mouthHeight = unit * (0.09f + mouth * 0.34f)
        drawOval(
            color = Color(0xFF8C294D),
            topLeft = Offset(centerX - unit * 0.32f, size.height * 0.61f + bob),
            size = Size(unit * 0.64f, mouthHeight),
        )
        if (mouth > 0.28f) {
            drawArc(
                color = Color(0xFFFF8FA8),
                startAngle = 185f,
                sweepAngle = 170f,
                useCenter = false,
                topLeft =
                    Offset(
                        centerX - unit * 0.21f,
                        size.height * 0.61f + bob + mouthHeight * 0.36f,
                    ),
                size = Size(unit * 0.42f, mouthHeight * 0.46f),
                style = Stroke(unit * 0.05f),
            )
        }

        drawLine(
            color = emotionColor.copy(alpha = 0.68f),
            start = Offset(centerX - unit * 1.65f, size.height * 0.82f),
            end = Offset(centerX + unit * 1.65f, size.height * 0.82f),
            strokeWidth = unit * 0.035f,
        )
    }
}

@Composable
private fun ConversationPanel(
    state: WaifuUiState,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val focusManager = LocalFocusManager.current
    var historyOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.messages.size, state.messages.lastOrNull()?.text?.length) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    Surface(
        modifier = modifier.animateContentSize(),
        color = Color(0xD10A0710),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        border =
            androidx.compose.foundation.BorderStroke(
                1.dp,
                WaifuPink.copy(alpha = 0.28f),
            ),
        tonalElevation = 5.dp,
    ) {
        Column(
            modifier =
                Modifier
                    .navigationBarsPadding()
                    .imePadding(),
        ) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 18.dp, end = 8.dp, top = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text =
                        "${state.settings.activePersona.name} · ${state.settings.activeModel}",
                    modifier = Modifier.weight(1f),
                    color = WaifuPeach,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                IconButton(
                    onClick = { historyOpen = !historyOpen },
                    modifier = Modifier.size(34.dp),
                ) {
                    Icon(
                        if (historyOpen) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowUp,
                        contentDescription = if (historyOpen) "Hide chat history" else "Show chat history",
                        tint = Color.White,
                    )
                }
            }

            state.error?.let { error ->
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 6.dp),
                )
            }

            if (historyOpen) {
                LazyColumn(
                    state = listState,
                    modifier =
                        Modifier
                            .heightIn(min = 110.dp, max = 300.dp)
                            .fillMaxWidth(),
                    contentPadding =
                        androidx.compose.foundation.layout.PaddingValues(
                            start = 14.dp,
                            end = 14.dp,
                            top = 6.dp,
                            bottom = 8.dp,
                        ),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(message)
                    }
                }
            }

            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                OutlinedTextField(
                    value = state.draft,
                    onValueChange = onDraftChange,
                    modifier = Modifier.weight(1f),
                    enabled = !state.isGenerating,
                    placeholder = { Text("Talk to her…") },
                    shape = RoundedCornerShape(22.dp),
                    maxLines = 4,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions =
                        KeyboardActions(
                            onSend = {
                                focusManager.clearFocus()
                                onSend()
                            },
                        ),
                )
                Spacer(Modifier.width(8.dp))
                Surface(
                    shape = CircleShape,
                    color = if (state.isGenerating) Color(0xFF362331) else WaifuPink,
                ) {
                    IconButton(
                        onClick = if (state.isGenerating) onStop else onSend,
                        modifier = Modifier.size(50.dp),
                        enabled = state.isGenerating || state.draft.isNotBlank(),
                    ) {
                        Icon(
                            imageVector = if (state.isGenerating) Icons.Default.Stop else Icons.Default.Send,
                            contentDescription = if (state.isGenerating) "Stop" else "Send",
                            tint = Color.White,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    if (message.role == MessageRole.SYSTEM) {
        Text(
            text = message.text,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 11.sp,
        )
        return
    }

    val user = message.role == MessageRole.USER
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (user) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(if (user) 0.82f else 0.9f),
            shape =
                if (user) {
                    RoundedCornerShape(20.dp, 20.dp, 5.dp, 20.dp)
                } else {
                    RoundedCornerShape(20.dp, 20.dp, 20.dp, 5.dp)
                },
            color = if (user) WaifuPink.copy(alpha = 0.84f) else Color(0xFF211724),
            border =
                if (user) {
                    null
                } else {
                    androidx.compose.foundation.BorderStroke(
                        1.dp,
                        WaifuPeach.copy(alpha = 0.16f),
                    )
                },
        ) {
            Text(
                text =
                    if (message.streaming && message.text.isEmpty()) {
                        "Thinking…"
                    } else {
                        message.text + if (message.streaming) " ▍" else ""
                    },
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                color = Color.White,
                lineHeight = 20.sp,
                fontSize = 14.sp,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun SettingsSheet(
    state: WaifuUiState,
    onDismiss: () -> Unit,
    onSave: (AppSettings) -> Unit,
    onSaveProviderKey: (AiProvider, String) -> Unit,
    onClearProviderKey: (AiProvider) -> Unit,
    onSaveFishKey: (String) -> Unit,
    onClearFishKey: () -> Unit,
    onImportBackup: () -> Unit,
    onImportVrm: () -> Unit,
    onSelectVrm: (String?) -> Unit,
    onDeleteVrm: (String) -> Unit,
    onResetExpression: () -> Unit,
    onPreviewAvatarSettings: (AppSettings) -> Unit,
    onPreviewModels: (AiProvider) -> Unit,
    onPreviewVercelEndpoints: (String) -> Unit,
    onRefreshFishVoices: (FishVoiceScope) -> Unit,
    onSaveMemoryProfile: (String) -> Unit,
    onClearMemory: () -> Unit,
    onClearChat: () -> Unit,
) {
    var draft by remember(state.settingsOpen) { mutableStateOf(state.settings) }
    var openRouterKey by remember(state.settingsOpen) { mutableStateOf("") }
    var vercelKey by remember(state.settingsOpen) { mutableStateOf("") }
    var fishKey by remember(state.settingsOpen) { mutableStateOf("") }
    var memoryProfile by remember(state.settingsOpen) { mutableStateOf(state.memoryProfile) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF130F17),
        contentColor = Color.White,
        windowInsets = WindowInsets.safeDrawing,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxHeight(0.94f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Mobile runtime", fontSize = 24.sp, fontWeight = FontWeight.Black)
                    Text(
                        "Direct provider connections · no Termux or desktop server",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close")
                }
            }

            val previewAvatar: (AppSettings) -> Unit = { next ->
                draft = next
                onPreviewAvatarSettings(next)
            }

            SectionTitle("Animation player")
            Text(
                "Native VRMA playback · ${BUNDLED_ANIMATION_CLIPS.size} bundled Sachi clips · non-base clips load on demand",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            LabeledSwitch(
                label = "Animation playback",
                checked = draft.animationPlaying,
                onCheckedChange = {
                    previewAvatar(draft.copy(animationPlaying = it))
                },
            )
            LabeledSwitch(
                label = "Shuffle safe base loop",
                checked = draft.animationShuffle,
                onCheckedChange = {
                    previewAvatar(draft.copy(animationShuffle = it))
                },
            )
            LabeledSwitch(
                label = "Loop current clip",
                checked = draft.animationLoop,
                onCheckedChange = {
                    previewAvatar(draft.copy(animationLoop = it))
                },
            )
            DropdownField(
                label = "Manual animation",
                value = draft.selectedAnimationAsset,
                options =
                    BUNDLED_ANIMATION_CLIPS.map {
                        it.assetPath to
                            if (it.safeAutoplay) {
                                "${it.label} · base"
                            } else {
                                "${it.label} · manual"
                            }
                    },
                onSelected = {
                    previewAvatar(
                        draft.copy(
                            selectedAnimationAsset = it,
                            animationShuffle = false,
                            animationPlaying = true,
                        ),
                    )
                },
            )
            SettingSlider(
                label = "Playback speed",
                value = draft.animationSpeed,
                range = 0.1f..3f,
                onValueChange = {
                    previewAvatar(draft.copy(animationSpeed = it))
                },
            )
            SettingSlider(
                label = "Autoplay duration",
                value = draft.animationDurationSeconds,
                range = 3f..60f,
                onValueChange = {
                    previewAvatar(draft.copy(animationDurationSeconds = it))
                },
            )
            OutlinedButton(
                onClick = {
                    previewAvatar(
                        draft.copy(
                            animationPlaying = true,
                            animationShuffle = true,
                            animationLoop = true,
                            animationSpeed = 1f,
                            animationDurationSeconds = 10f,
                            selectedAnimationAsset = BUNDLED_ANIMATION_CLIPS.first().assetPath,
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Reset animation player")
            }

            SectionTitle("Waifu4 renderer")
            Text(
                "The original Three.js + Pixiv MToon material, outline, lighting, arm guard, and RGB post-processing controls.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            LabeledSwitch(
                label = "Post-processing",
                checked = draft.postProcessingEnabled,
                onCheckedChange = {
                    previewAvatar(draft.copy(postProcessingEnabled = it))
                },
            )
            LabeledSwitch(
                label = "MToon outline",
                checked = draft.outlineEnabled,
                onCheckedChange = {
                    previewAvatar(draft.copy(outlineEnabled = it))
                },
            )
            SettingSlider(
                label = "Outline size",
                value = draft.outlineThickness,
                range = 0.0005f..0.02f,
                onValueChange = {
                    previewAvatar(draft.copy(outlineThickness = it))
                },
            )
            SettingSlider(
                label = "Outline alpha",
                value = draft.outlineAlpha,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(outlineAlpha = it))
                },
            )
            LabeledSwitch(
                label = "Color correction",
                checked = draft.colorCorrectionEnabled,
                onCheckedChange = {
                    previewAvatar(draft.copy(colorCorrectionEnabled = it))
                },
            )
            SettingSlider(
                label = "Exposure",
                value = draft.sceneExposure,
                range = 0.35f..1.8f,
                onValueChange = {
                    previewAvatar(draft.copy(sceneExposure = it))
                },
            )
            SettingSlider(
                label = "Red power",
                value = draft.colorPowerR,
                range = 1f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(colorPowerR = it))
                },
            )
            SettingSlider(
                label = "Green power",
                value = draft.colorPowerG,
                range = 1f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(colorPowerG = it))
                },
            )
            SettingSlider(
                label = "Blue power",
                value = draft.colorPowerB,
                range = 1f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(colorPowerB = it))
                },
            )
            LabeledSwitch(
                label = "Arm clip guard",
                checked = draft.armClipGuardEnabled,
                onCheckedChange = {
                    previewAvatar(draft.copy(armClipGuardEnabled = it))
                },
            )
            SettingSlider(
                label = "Arm guard strength",
                value = draft.armClipGuardStrength,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(armClipGuardStrength = it))
                },
            )
            SettingSlider(
                label = "Arm torso radius",
                value = draft.armClipTorsoRadius,
                range = 0.08f..0.55f,
                onValueChange = {
                    previewAvatar(draft.copy(armClipTorsoRadius = it))
                },
            )
            LabeledSwitch(
                label = "Custom MToon tuning",
                checked = draft.mtoonTuningEnabled,
                onCheckedChange = {
                    previewAvatar(draft.copy(mtoonTuningEnabled = it))
                },
            )
            SettingSlider(
                label = "MToon shade shift",
                value = draft.mtoonShadeShift,
                range = -1f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonShadeShift = it))
                },
            )
            SettingSlider(
                label = "MToon toony",
                value = draft.mtoonToony,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonToony = it))
                },
            )
            SettingSlider(
                label = "MToon GI equalize",
                value = draft.mtoonGiEqualization,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonGiEqualization = it))
                },
            )
            SettingSlider(
                label = "MToon rim lift",
                value = draft.mtoonRimLift,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonRimLift = it))
                },
            )
            SettingSlider(
                label = "MToon rim power",
                value = draft.mtoonRimFresnel,
                range = 0.1f..10f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonRimFresnel = it))
                },
            )
            SettingSlider(
                label = "MToon rim lighting",
                value = draft.mtoonRimLightingMix,
                range = 0f..1f,
                onValueChange = {
                    previewAvatar(draft.copy(mtoonRimLightingMix = it))
                },
            )
            SettingSlider(
                label = "Key light",
                value = draft.keyLight,
                range = 0f..3f,
                onValueChange = {
                    previewAvatar(draft.copy(keyLight = it))
                },
            )
            SettingSlider(
                label = "Fill light",
                value = draft.fillLight,
                range = 0f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(fillLight = it))
                },
            )
            SettingSlider(
                label = "Rim light",
                value = draft.rimLight,
                range = 0f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(rimLight = it))
                },
            )
            SettingSlider(
                label = "Hemisphere light",
                value = draft.hemiLight,
                range = 0f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(hemiLight = it))
                },
            )
            SettingSlider(
                label = "Ambient light",
                value = draft.ambientLight,
                range = 0f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(ambientLight = it))
                },
            )
            OutlinedButton(
                onClick = {
                    previewAvatar(
                        draft.copy(
                            postProcessingEnabled = true,
                            colorCorrectionEnabled = false,
                            sceneExposure = 0.85f,
                            colorPowerR = 1.4f,
                            colorPowerG = 1.45f,
                            colorPowerB = 1.45f,
                            outlineEnabled = true,
                            outlineAlpha = 0.8f,
                            outlineThickness = 0.003f,
                            armClipGuardEnabled = true,
                            armClipGuardStrength = 0.75f,
                            armClipTorsoRadius = 0.24f,
                            mtoonTuningEnabled = false,
                            mtoonGiEqualization = 0.9f,
                            mtoonRimFresnel = 5f,
                            mtoonRimLift = 0f,
                            mtoonRimLightingMix = 1f,
                            mtoonShadeShift = 0f,
                            mtoonToony = 0.9f,
                            keyLight = 0.8f,
                            fillLight = 0.3f,
                            rimLight = 0.35f,
                            hemiLight = 0.35f,
                            ambientLight = 0.35f,
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Reset Waifu4 renderer")
            }

            SectionTitle("Character")
            DropdownField(
                label = "Personality",
                value = draft.activePersonaId,
                options = DEFAULT_PERSONAS.map { it.id to "${it.name} · ${it.description}" },
                onSelected = { draft = draft.copy(activePersonaId = it) },
            )
            Text(
                DEFAULT_PERSONAS.firstOrNull { it.id == draft.activePersonaId }?.systemPrompt.orEmpty(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )

            SectionTitle("Mobile memory")
            Text(
                "${state.memoryHighlightCount} stored highlights for ${state.settings.activePersona.name} · local only · no memory-worker request",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            LabeledSwitch(
                label = "Use durable memory",
                checked = draft.memoryEnabled,
                onCheckedChange = {
                    draft = draft.copy(memoryEnabled = it)
                },
            )
            SettingSlider(
                label = "Prompt highlights",
                value = draft.memoryMaxHighlights.toFloat(),
                range = 2f..10f,
                onValueChange = {
                    draft = draft.copy(memoryMaxHighlights = it.toInt().coerceIn(2, 10))
                },
            )
            OutlinedTextField(
                value = memoryProfile,
                onValueChange = { memoryProfile = it.take(1_200) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Pinned user / relationship notes") },
                supportingText = {
                    Text("Always available to this persona; current messages override stale notes.")
                },
                minLines = 3,
                maxLines = 7,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { onSaveMemoryProfile(memoryProfile) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Save profile")
                }
                OutlinedButton(
                    onClick = {
                        memoryProfile = ""
                        onClearMemory()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Clear memory")
                }
            }

            SectionTitle("Avatar source")
            DropdownField(
                label = "VRM model",
                value =
                    state.activeVrmModelId?.let { "saved:$it" }
                        ?: "bundled:${state.activeBundledVrmId}",
                options =
                    buildList {
                        addAll(
                            BUNDLED_VRM_MODELS.map {
                                "bundled:${it.id}" to it.label
                            },
                        )
                        addAll(
                            state.savedVrmModels.map {
                                "saved:${it.id}" to "Saved · ${it.name}"
                            },
                        )
                    },
                onSelected = { modelId ->
                    onSelectVrm(modelId)
                },
            )
            Text(
                "${state.avatarStatus} · ${
                    state.savedVrmModels.size
                } saved custom VRM${if (state.savedVrmModels.size == 1) "" else "s"}",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            OutlinedButton(
                onClick = onImportVrm,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("[ LOAD .VRM FILE ]")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onResetExpression,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Reset face")
                }
                OutlinedButton(
                    onClick = {
                        state.activeVrmModelId?.let(onDeleteVrm)
                    },
                    enabled = state.activeVrmModelId != null,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Delete saved")
                }
            }
            DropdownField(
                label = "Camera framing",
                value = draft.cameraViewMode.name,
                options = CameraViewMode.entries.map { it.name to it.displayName },
                onSelected = {
                    previewAvatar(draft.copy(cameraViewMode = CameraViewMode.valueOf(it)))
                },
            )
            SettingSlider(
                label = "Model scale",
                value = draft.avatarScale,
                range = 0.25f..4f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarScale = it))
                },
            )
            SettingSlider(
                label = "Move left / right",
                value = draft.avatarPositionX,
                range = -3f..3f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarPositionX = it))
                },
            )
            SettingSlider(
                label = "Move up / down",
                value = draft.avatarVerticalOffset,
                range = -2f..2f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarVerticalOffset = it))
                },
            )
            SettingSlider(
                label = "Move forward / back",
                value = draft.avatarPositionZ,
                range = -3f..3f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarPositionZ = it))
                },
            )
            SettingSlider(
                label = "Pitch",
                value = draft.avatarRotationX,
                range = -45f..45f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarRotationX = it))
                },
            )
            SettingSlider(
                label = "Yaw",
                value = draft.avatarRotationY,
                range = -180f..180f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarRotationY = it))
                },
            )
            SettingSlider(
                label = "Roll",
                value = draft.avatarRotationZ,
                range = -45f..45f,
                onValueChange = {
                    previewAvatar(draft.copy(avatarRotationZ = it))
                },
            )
            OutlinedButton(
                onClick = {
                    previewAvatar(
                        draft.copy(
                            cameraViewMode = CameraViewMode.HALF_BODY,
                            avatarScale = 1f,
                            avatarPositionX = 0f,
                            avatarVerticalOffset = 0f,
                            avatarPositionZ = 0f,
                            avatarRotationX = 0f,
                            avatarRotationY = 0f,
                            avatarRotationZ = 0f,
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Reset avatar transform")
            }

            SectionTitle("AI provider")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AiProvider.entries.forEach { provider ->
                    FilterChip(
                        selected = draft.provider == provider,
                        onClick = {
                            draft =
                                when (provider) {
                                    AiProvider.OPENROUTER ->
                                        draft.copy(
                                            provider = provider,
                                            openRouterRouting = OpenRouterRouting.LATENCY,
                                            openRouterProviderSlugs = "",
                                            openRouterAllowFallbacks = true,
                                        )
                                    AiProvider.VERCEL ->
                                        draft.copy(
                                            provider = provider,
                                            vercelRouting = VercelRouting.AUTO,
                                            vercelProviderSlugs = "",
                                            vercelAllowFallbacks = true,
                                        )
                                }
                            onPreviewModels(provider)
                        },
                        label = { Text(provider.displayName) },
                    )
                }
            }

            ProviderKeyField(
                label = "OpenRouter API key",
                value = openRouterKey,
                onValueChange = { openRouterKey = it },
                configured = state.hasOpenRouterKey,
                onClear = { onClearProviderKey(AiProvider.OPENROUTER) },
            )
            ProviderKeyField(
                label = "Vercel AI Gateway key",
                value = vercelKey,
                onValueChange = { vercelKey = it },
                configured = state.hasVercelKey,
                onClear = { onClearProviderKey(AiProvider.VERCEL) },
            )
            Text(
                "Keys are encrypted with an AES/GCM key held by Android Keystore.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            OutlinedButton(
                onClick = onImportBackup,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Import Waifu4 local-transfer backup")
            }

            val selectedModel =
                when (draft.provider) {
                    AiProvider.OPENROUTER -> draft.openRouterModel
                    AiProvider.VERCEL -> draft.vercelModel
                }
            val modelOptions =
                buildList {
                    add(selectedModel to selectedModel)
                    if (state.modelCatalogProvider == draft.provider) {
                        addAll(state.availableModels.map { it.id to it.label })
                    }
                }.distinctBy { it.first }
            DropdownField(
                label =
                    if (draft.provider == AiProvider.OPENROUTER) {
                        "OpenRouter model"
                    } else {
                        "Vercel AI Gateway model"
                    },
                value = selectedModel,
                options = modelOptions,
                onSelected = { model ->
                    draft =
                        when (draft.provider) {
                            AiProvider.OPENROUTER -> draft.copy(openRouterModel = model)
                            AiProvider.VERCEL -> {
                                onPreviewVercelEndpoints(model)
                                draft.copy(vercelModel = model)
                            }
                        }
                },
            )
            state.availableModels.firstOrNull { it.id == selectedModel }?.let { metadata ->
                Text(
                    "Capabilities: ${
                        metadata.capabilities.ifEmpty { setOf("metadata loaded") }.joinToString()
                    }",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                )
            }
            OutlinedButton(
                onClick = { onPreviewModels(draft.provider) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.modelsLoading,
            ) {
                Text(if (state.modelsLoading) "Loading model catalog…" else "Refresh model catalog")
            }
            state.modelsError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp)
            }

            if (draft.provider == AiProvider.OPENROUTER) {
                Text("OpenRouter routing", fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OpenRouterRouting.entries.forEach { routing ->
                        FilterChip(
                            selected = draft.openRouterRouting == routing,
                            onClick = { draft = draft.copy(openRouterRouting = routing) },
                            label = { Text(routing.displayName) },
                        )
                    }
                }
                if (draft.openRouterRouting == OpenRouterRouting.PINNED) {
                    OutlinedTextField(
                        value = draft.openRouterProviderSlugs,
                        onValueChange = { draft = draft.copy(openRouterProviderSlugs = it) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Provider slugs, comma-separated") },
                        singleLine = true,
                    )
                    LabeledSwitch(
                        label = "Allow provider fallbacks",
                        checked = draft.openRouterAllowFallbacks,
                        onCheckedChange = {
                            draft = draft.copy(openRouterAllowFallbacks = it)
                        },
                    )
                }
            } else {
                Text("Vercel routing", fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    VercelRouting.entries.forEach { routing ->
                        FilterChip(
                            selected = draft.vercelRouting == routing,
                            onClick = { draft = draft.copy(vercelRouting = routing) },
                            label = { Text(routing.displayName) },
                        )
                    }
                }
                if (draft.vercelRouting == VercelRouting.PINNED) {
                    if (state.vercelProviderEndpoints.isNotEmpty()) {
                        DropdownField(
                            label = "Selected-model provider",
                            value =
                                draft.vercelProviderSlugs
                                    .takeUnless { it.contains(',') }
                                    .orEmpty(),
                            options =
                                buildList {
                                    add("" to "Choose provider")
                                    addAll(
                                        state.vercelProviderEndpoints
                                            .filter { it.status == null || it.status == 0 }
                                            .map { endpoint ->
                                                val tags =
                                                    buildList {
                                                        if (endpoint.supportsStructuredOutputs) add("json")
                                                        if (endpoint.supportsImplicitCaching) add("cache")
                                                        endpoint.latencyP50Ms?.let {
                                                            add("${it.toInt()}ms")
                                                        }
                                                    }
                                                endpoint.providerName to
                                                    if (tags.isEmpty()) {
                                                        endpoint.providerName
                                                    } else {
                                                        "${endpoint.providerName} [${tags.joinToString()}]"
                                                    }
                                            },
                                    )
                                },
                            onSelected = {
                                draft = draft.copy(vercelProviderSlugs = it)
                            },
                        )
                    }
                    OutlinedTextField(
                        value = draft.vercelProviderSlugs,
                        onValueChange = { draft = draft.copy(vercelProviderSlugs = it) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Provider slugs, comma-separated") },
                        singleLine = true,
                    )
                    LabeledSwitch(
                        label = "Allow provider fallbacks",
                        checked = draft.vercelAllowFallbacks,
                        onCheckedChange = {
                            draft = draft.copy(vercelAllowFallbacks = it)
                        },
                    )
                }
                when {
                    state.endpointsLoading ->
                        Text(
                            "Loading selected-model provider endpoints…",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                        )
                    state.endpointsError != null ->
                        Text(
                            state.endpointsError,
                            color = MaterialTheme.colorScheme.error,
                            fontSize = 11.sp,
                        )
                    state.vercelProviderEndpoints.isNotEmpty() ->
                        Text(
                            "${state.vercelProviderEndpoints.count { it.status == null || it.status == 0 }} active provider endpoints · structured replies require every eligible endpoint to advertise JSON.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                        )
                }
            }

            DropdownField(
                label = "Reply length",
                value = draft.replyLength.name,
                options = ReplyLength.entries.map { it.name to it.displayName },
                onSelected = { draft = draft.copy(replyLength = ReplyLength.valueOf(it)) },
            )
            OutlinedTextField(
                value = draft.runtimeSituation,
                onValueChange = { draft = draft.copy(runtimeSituation = it.take(2_000)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Runtime situation") },
                placeholder = { Text("Current setup or context for this conversation") },
                minLines = 2,
                maxLines = 5,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Temperature", modifier = Modifier.weight(1f))
                Text("%.1f".format(draft.temperature), color = WaifuPeach)
            }
            Slider(
                value = draft.temperature,
                onValueChange = { draft = draft.copy(temperature = it) },
                valueRange = 0f..1.4f,
                steps = 13,
            )

            HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
            SectionTitle("Fish realtime voice")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.GraphicEq, contentDescription = null, tint = WaifuCyan)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Speak streamed replies", fontWeight = FontWeight.SemiBold)
                    Text(
                        "Realtime WebSocket · S2 · PCM AudioTrack",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                    )
                }
                Switch(
                    checked = draft.voiceEnabled,
                    onCheckedChange = { draft = draft.copy(voiceEnabled = it) },
                )
            }
            LabeledSwitch(
                label = "Auto-speak assistant replies",
                checked = draft.voiceAutoSpeak,
                onCheckedChange = { draft = draft.copy(voiceAutoSpeak = it) },
            )
            ProviderKeyField(
                label = "Fish Audio API key",
                value = fishKey,
                onValueChange = { fishKey = it },
                configured = state.hasFishKey,
                onClear = onClearFishKey,
            )
            DropdownField(
                label = "Fish voice catalog",
                value = draft.fishVoiceScope.name,
                options = FishVoiceScope.entries.map { it.name to it.displayName },
                onSelected = {
                    val scope = FishVoiceScope.valueOf(it)
                    draft = draft.copy(fishVoiceScope = scope)
                    onRefreshFishVoices(scope)
                },
            )
            val visibleFishVoices =
                if (state.fishVoicesScope == draft.fishVoiceScope) {
                    state.fishVoices
                } else {
                    emptyList()
                }
            FishVoicePickerField(
                value = draft.fishVoiceId,
                voices = visibleFishVoices,
                onSelected = { draft = draft.copy(fishVoiceId = it) },
            )
            OutlinedTextField(
                value = draft.fishVoiceId,
                onValueChange = { draft = draft.copy(fishVoiceId = it) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Fish reference / voice ID (blank = Fish default)") },
                singleLine = true,
            )
            OutlinedButton(
                onClick = { onRefreshFishVoices(draft.fishVoiceScope) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.fishVoicesLoading,
            ) {
                Text(
                    if (state.fishVoicesLoading) {
                        "Fetching Fish voices…"
                    } else {
                        "Fetch Fish Voices"
                    },
                )
            }
            when {
                state.fishVoicesError != null ->
                    Text(
                        state.fishVoicesError,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 11.sp,
                    )
                state.fishVoicesLoading ->
                    Text(
                        "Fetching ${draft.fishVoiceScope.displayName.lowercase()}…",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                    )
                state.fishVoicesScope == draft.fishVoiceScope ->
                    Text(
                        "${visibleFishVoices.size} Fish voice models loaded.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                    )
            }
            DropdownField(
                label = "Fish TTS model",
                value = draft.fishModel,
                options =
                    listOf(
                        "s2.1-pro" to "S2.1 Pro · paid production tier",
                        "s2.1-pro-free" to "S2.1 Pro Free · best effort",
                        "s2" to "S2 Pro",
                        "s1" to "S1",
                    ),
                onSelected = { draft = draft.copy(fishModel = it) },
            )
            DropdownField(
                label = "Fish latency",
                value = draft.fishLatency.name,
                options = FishLatency.entries.map { it.name to it.displayName },
                onSelected = { draft = draft.copy(fishLatency = FishLatency.valueOf(it)) },
            )
            DropdownField(
                label = "PCM sample rate",
                value = draft.fishSampleRate.toString(),
                options =
                    listOf(16_000, 22_050, 24_000, 32_000, 44_100, 48_000)
                        .map { it.toString() to "$it Hz" },
                onSelected = { draft = draft.copy(fishSampleRate = it.toInt()) },
            )
            LabeledSwitch(
                label = "Condition previous chunks",
                checked = draft.fishConditionOnPreviousChunks,
                onCheckedChange = {
                    draft = draft.copy(fishConditionOnPreviousChunks = it)
                },
            )
            DropdownField(
                label = "Fish live chunking",
                value = draft.fishLiveChunkingStrategy.name,
                options =
                    FishLiveChunkingStrategy.entries.map {
                        it.name to it.displayName
                    },
                onSelected = {
                    draft =
                        draft.copy(
                            fishLiveChunkingStrategy =
                                FishLiveChunkingStrategy.valueOf(it),
                        )
                },
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Fish chunk length", modifier = Modifier.weight(1f))
                Text("${draft.fishChunkLength} chars", color = WaifuPeach)
            }
            Slider(
                value = draft.fishChunkLength.toFloat(),
                onValueChange = { draft = draft.copy(fishChunkLength = it.toInt()) },
                valueRange = 100f..300f,
                steps = 19,
            )

            HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
            SectionTitle("Mouth lipsync")
            DropdownField(
                label = "Lipsync mode",
                value = draft.lipSyncMode.name,
                options = LipSyncMode.entries.map { it.name to it.displayName },
                onSelected = { draft = draft.copy(lipSyncMode = LipSyncMode.valueOf(it)) },
            )
            Text(
                "Waifu4 wLipSync profile · A/I/U/E/O · live PCM playback clock",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp,
            )
            SettingSlider(
                label = "Smoothing",
                value = draft.lipSyncSmoothing,
                range = 0f..0.95f,
                onValueChange = { draft = draft.copy(lipSyncSmoothing = it) },
            )
            SettingSlider(
                label = "Mouth gain",
                value = draft.lipSyncGain,
                range = 0f..2f,
                onValueChange = { draft = draft.copy(lipSyncGain = it) },
            )
            SettingSlider(
                label = "Volume influence",
                value = draft.lipSyncVolumeInfluence,
                range = 0f..2f,
                onValueChange = { draft = draft.copy(lipSyncVolumeInfluence = it) },
            )

            HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
            OutlinedButton(
                onClick = onClearChat,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.DeleteOutline, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Clear conversation")
            }
            Button(
                onClick = {
                    if (openRouterKey.isNotBlank()) {
                        onSaveProviderKey(AiProvider.OPENROUTER, openRouterKey)
                    }
                    if (vercelKey.isNotBlank()) {
                        onSaveProviderKey(AiProvider.VERCEL, vercelKey)
                    }
                    if (fishKey.isNotBlank()) onSaveFishKey(fishKey)
                    onSaveMemoryProfile(memoryProfile)
                    onSave(draft)
                },
                modifier = Modifier.fillMaxWidth().height(54.dp),
                colors = ButtonDefaults.buttonColors(containerColor = WaifuPink),
            ) {
                Text("Save mobile configuration", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun FishVoicePickerField(
    value: String,
    voices: List<RemoteTtsVoice>,
    onSelected: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    var query by remember(open) { mutableStateOf("") }
    val selected = voices.firstOrNull { it.id == value }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            "Fish voice model",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
        )
        OutlinedButton(
            onClick = { open = true },
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        value.isBlank() -> "Server default / manual Fish reference"
                        selected != null -> selected.name
                        else -> "Manual Fish reference"
                    },
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (value.isNotBlank()) {
                    Text(
                        value,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 10.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Choose Fish voice")
        }
    }
    if (open) {
        val normalizedQuery = query.trim().lowercase()
        val filtered =
            if (normalizedQuery.isBlank()) {
                voices
            } else {
                voices.filter { voice ->
                    voice.name.lowercase().contains(normalizedQuery) ||
                        voice.id.lowercase().contains(normalizedQuery) ||
                        voice.languages.any { it.lowercase().contains(normalizedQuery) } ||
                        voice.source?.lowercase()?.contains(normalizedQuery) == true ||
                        voice.tags.any { it.lowercase().contains(normalizedQuery) }
                }
            }
        AlertDialog(
            onDismissRequest = { open = false },
            title = {
                Column {
                    Text("Choose Fish voice")
                    Text(
                        "${voices.size} models · ${filtered.size} shown",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Normal,
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it.take(100) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Search name, language, creator, or ID") },
                        singleLine = true,
                    )
                    LazyColumn(Modifier.heightIn(max = 430.dp)) {
                        item(key = "fish-default") {
                            FishVoiceRow(
                                title = "Server default / manual reference",
                                subtitle = "Leave reference_id blank",
                                selected = value.isBlank(),
                                onClick = {
                                    onSelected("")
                                    open = false
                                },
                            )
                        }
                        items(filtered, key = RemoteTtsVoice::id) { voice ->
                            val details =
                                buildList {
                                    if (voice.languages.isNotEmpty()) {
                                        add(voice.languages.joinToString(", "))
                                    }
                                    voice.source?.let(::add)
                                    add(voice.id)
                                }.joinToString(" · ")
                            FishVoiceRow(
                                title = voice.name,
                                subtitle = details,
                                selected = value == voice.id,
                                onClick = {
                                    onSelected(voice.id)
                                    open = false
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }) {
                    Text("Close")
                }
            },
        )
    }
}

@Composable
private fun FishVoiceRow(
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(if (selected) WaifuPink.copy(alpha = 0.16f) else Color.Transparent)
                .clickable(onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = if (selected) WaifuPeach else Color.White,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                subtitle,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 10.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelected: (String) -> Unit,
) {
    var expanded by remember(value, options) { mutableStateOf(false) }
    val display = options.firstOrNull { it.first == value }?.second ?: value
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = display,
            onValueChange = {},
            modifier = Modifier.menuAnchor().fillMaxWidth(),
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
            maxLines = 2,
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { (id, optionLabel) ->
                DropdownMenuItem(
                    text = { Text(optionLabel) },
                    onClick = {
                        expanded = false
                        onSelected(id)
                    },
                )
            }
        }
    }
}

@Composable
private fun SettingSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onValueChange: (Float) -> Unit,
) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, modifier = Modifier.weight(1f))
            Text("%.2f".format(value), color = WaifuPeach)
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = range,
        )
    }
}

@Composable
private fun ProviderKeyField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    configured: Boolean,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(label) },
            placeholder = {
                Text(if (configured) "Configured — enter only to replace" else "Not configured")
            },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            trailingIcon = {
                if (value.isNotEmpty()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear input")
                    }
                }
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            AssistChip(
                onClick = {},
                label = { Text(if (configured) "Encrypted key saved" else "Key required") },
            )
            if (configured) {
                TextButton(onClick = onClear) { Text("Remove") }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(),
        color = WaifuPeach,
        fontSize = 12.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = 1.2.sp,
    )
}

@Composable
private fun LabeledSwitch(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

private fun emotionColor(emotion: ReplyEmotion): Color =
    when (emotion.name) {
        "happy" -> Color(0xFFFFC857)
        "caring", "grateful", "affectionate" -> Color(0xFFFF85A1)
        "curious", "thinking" -> WaifuCyan
        "surprised" -> Color(0xFFA78BFA)
        "sad" -> Color(0xFF70A5FF)
        "angry", "annoyed" -> Color(0xFFFF5A5F)
        "embarrassed", "nervous" -> Color(0xFFFF91B8)
        "optimistic", "proud", "excited", "amused" -> Color(0xFFFFC857)
        else -> WaifuPink
    }.copy(alpha = 0.55f + emotion.intensity * 0.45f)
