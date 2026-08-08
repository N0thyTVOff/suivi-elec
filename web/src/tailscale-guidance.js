export function tailscaleApprovalMessage(result) {
  const tailnet = result.tailnetDnsName
    ? `le réseau « ${result.tailnetDnsName} » utilisé par ce PC`
    : 'le réseau Tailscale utilisé par ce PC';

  if (result.adminPageOpened) {
    return `Tailscale indique que HTTPS n’est pas actif pour ${tailnet}. Dans la page DNS ouverte, sélectionnez ce réseau, activez « HTTPS Certificates », puis revenez ici.`;
  }

  return `Tailscale indique toujours que HTTPS n’est pas actif pour ${tailnet}. Vérifiez que ce nom apparaît dans la page DNS et que « HTTPS Certificates » affiche « Disable HTTPS ». Redémarrez ensuite Tailscale puis réessayez.`;
}
