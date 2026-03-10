// Extends Window to declare the YouTube IFrame API global callback and namespace.
// The YT.Player constructor sets window.onYouTubeIframeAPIReady when the API loads.
interface Window {
  onYouTubeIframeAPIReady?: () => void;
  YT?: typeof YT;
}
