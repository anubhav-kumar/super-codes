defmodule LiveBettingWeb.PageController do
  use LiveBettingWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
