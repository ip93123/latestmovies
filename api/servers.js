export default async function handler(req, res) {
  const { id, type, season, episode } = req.query;

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  let urls = [];
  let labels = [];

  if (type === 'tv') {
    const s = season || 1;
    const e = episode || 1;
    
    urls = [
      `https://vidy.st/tv/${id}/${s}/${e}?color=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&sub=false&subtitles=false&cc=false&subLang=none`,
      `https://vidstuck.xyz/embed/tv/${id}/${s}/${e}?branding=HackyMax&color=E8C97A&autoplay=true&nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&subtitle=none&sub=false`,
      `https://player.cinezo.live/embed/tv/${id}/${s}/${e}?autoplay=true&opacity=0&fontsize=0&fontcolor=transparent&primarycolor=e8b86d&secondarycolor=0a0a12`,
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?autoplay=true&showNextEpisode=1&sub=false&subtitles=false`,
      `https://player.videasy.ws/embed/tv/${id}/${s}/${e}?autoplay=1&autonext=1&ds_lang=none&sub=0&subtitles=false`,
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&sub.mode=manual`,
      `https://cdn.vidspark.to/tv/${id}/${s}/${e}?autoplay=true&sub=false`,
      `https://vidnest.fun/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vixsrc.to/tv/${id}/${s}/${e}?autoplay=1`
    ];
    labels = ['HackyMax', 'Nebula', 'Cinezo', 'Nova', 'Vortex', 'Infinity', 'Spark', 'Zenith', 'Hyperion'];

  } else {
    // Movie
    urls = [
      `https://vidy.st/movie/${id}?color=E8C97A&autoplay=true&sub=false&subtitles=false&cc=false&subLang=none`,
      `https://vidstuck.xyz/embed/movie/${id}?branding=HackyMax&color=E8C97A&autoplay=true&subtitle=none&sub=false`,
      `https://player.cinezo.live/embed/movie/${id}?autoplay=true&opacity=0&fontsize=0&fontcolor=transparent&primarycolor=e8b86d&secondarycolor=0a0a12`,
      `https://vidlove.cc/embed/movie/${id}?autoplay=true&sub=false&subtitles=false`,
      `https://player.videasy.ws/embed/movie/${id}?autoplay=1&ds_lang=none&sub=0&subtitles=false`,
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&sub.mode=manual`,
      `https://cdn.vidspark.to/movie/${id}?autoplay=true&sub=false`,
      `https://vidnest.fun/movie/${id}?autoplay=1`,
      `https://vixsrc.to/movie/${id}?autoplay=1`
    ];
    labels = ['HackyMax', 'Nebula', 'Cinezo', 'Nova', 'Vortex', 'Infinity', 'Spark', 'Zenith', 'Hyperion'];
  }

  // Prevent caching so new server labels appear instantly
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({ urls, labels });
}
